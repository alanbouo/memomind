"""
Chat with a transcript, through the Anthropic API.

The transcript goes in a cached system block, so follow-up questions on the
same transcript only pay for the new turn.
"""
import json
import os
from typing import Iterator, List, Sequence

import anthropic

# Override with CHAT_MODEL (e.g. "claude-haiku-5-5" for a cheaper, faster chat).
MODEL = os.getenv("CHAT_MODEL", "claude-sonnet-5-5")
MAX_TOKENS = 4096

LENGTH_HINTS = {
    "short": "Keep answers very short: a few sentences at most.",
    "detailed": "Give thorough, well-structured answers.",
}

SYSTEM_RULES = """You are MemoMind's assistant. The user is asking about the transcript of an audio recording (a voice memo, meeting, interview or call).

- Start from the transcript. When it contains the answer, answer from it and never invent what was said.
- The user may ask to go beyond the recording (background, history, explanations, comparisons). Then use your general knowledge, and mark clearly which part comes from the recording and which part comes from you. Never present your own knowledge as something said in the recording.
- You have a web search tool: use it when the question needs sources or facts beyond the transcript and your own knowledge (recent facts, verifiable references), never for what the transcript answers. Say which part of the answer comes from the web.
- Always reply in the language of the user's question.
- Format with Markdown when it helps (short lists, bold for key terms, headings for long answers); plain sentences for simple answers.
- When you quote or point to a passage, include its timestamp if the transcript has one.
- Speakers are labelled in the transcript; refer to them by those names."""


class ChatNotConfigured(Exception):
    pass


def _client() -> anthropic.Anthropic:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise ChatNotConfigured("ANTHROPIC_API_KEY is not configured")
    return anthropic.Anthropic()


def system_blocks(transcript_text: str, template: str = "", length: str = "medium") -> List[dict]:
    """The system prompt: stable rules first, then the transcript, marked cacheable."""
    if template and template.strip():
        # The user's own prompt replaces our rules; {transcript} marks where the text goes.
        if "{transcript}" in template:
            text = template.replace("{transcript}", transcript_text)
        else:
            text = f"{template}\n\n[TRANSCRIPT]:\n{transcript_text}"
    else:
        hint = LENGTH_HINTS.get(length, "")
        text = f"{SYSTEM_RULES}{chr(10) + hint if hint else ''}\n\n<transcript>\n{transcript_text}\n</transcript>"
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


def clean_history(messages: List[dict]) -> List[dict]:
    """The API wants the conversation to start with a user turn."""
    out = list(messages)
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search", "max_uses": 3}


def _params(system: List[dict], messages: List[dict]) -> dict:
    return dict(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=messages,
        output_config={"effort": "low"},  # chat: latency matters more than depth
        tools=[WEB_SEARCH_TOOL],
    )


SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "claude-haiku-5-5")

SUMMARY_SYSTEM = """You write the title and the summary of an audio transcript (a voice memo, meeting, interview or call).
- Write both in the language of the transcript.
- title: at most 60 characters, says what it is about, no quotes, no trailing period, no date.
- summary: 2 to 3 plain sentences (no Markdown, no lists) with the essentials: the subject, the key points or decisions, and who is involved if it matters.
- tags: 2 to 3 short topic labels (one or two words, lower case, in the language of the transcript), like "budget", "recrutement", "idée produit". Never a person's name or a generic word such as "audio" or "réunion" unless it really is the subject. The user's existing tags are given in <known_tags>: reuse one when it fits rather than inventing a near-duplicate.
- Speakers are labelled in the transcript, either with a name or with a letter (A, B…). Always refer to a person by name: use the label when it is a name, and otherwise the name the conversation reveals (introductions, being addressed). If a speaker has no known name, describe them by role ("l'interviewé", "le client"), never "Speaker A"."""

SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "tags": {"type": "array", "items": {"type": "string"}}},
    "required": ["title", "summary", "tags"],
    "additionalProperties": False,
}


def summarize(transcript_text: str, known_tags: Sequence[str] = ()) -> dict:
    """A short title, summary and suggested tags for a transcript: {"title", "summary", "tags"}."""
    known = ", ".join(known_tags)
    response = _client().messages.create(
        model=SUMMARY_MODEL,
        max_tokens=1024,
        system=SUMMARY_SYSTEM,
        messages=[{"role": "user", "content": f"<known_tags>{known}</known_tags>\n<transcript>\n{transcript_text}\n</transcript>"}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SUMMARY_SCHEMA}},
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("summary refused")
    data = json.loads(next(b.text for b in response.content if b.type == "text"))
    return {
        "title": data["title"].strip().strip('"\'').rstrip(".")[:80],
        "summary": data["summary"].strip(),
        "tags": [str(t) for t in data.get("tags", [])][:3],
    }


REFUSAL_TEXT = "Je ne peux pas répondre à cette demande."


def stream_reply(system: List[dict], messages: List[dict]) -> Iterator[str]:
    """Yield the answer's text as it is generated."""
    client = _client()
    with client.messages.stream(**_params(system, messages)) as stream:
        for text in stream.text_stream:
            yield text
        final = stream.get_final_message()
    if final.stop_reason == "refusal":
        yield REFUSAL_TEXT


def reply(system: List[dict], messages: List[dict]) -> str:
    return "".join(stream_reply(system, messages))
