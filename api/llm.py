"""
Chat with a transcript, through the Anthropic API.

The transcript goes in a cached system block, so follow-up questions on the
same transcript only pay for the new turn.
"""
import json
import os
from typing import Iterator, List

import anthropic

# Override with CHAT_MODEL (e.g. "claude-haiku-5-5" for a cheaper, faster chat).
MODEL = os.getenv("CHAT_MODEL", "claude-sonnet-5-5")
MAX_TOKENS = 4096

LENGTH_HINTS = {
    "short": "Keep answers very short: a few sentences at most.",
    "detailed": "Give thorough, well-structured answers.",
}

SYSTEM_RULES = """You are MemoMind's assistant. The user is asking about the transcript of an audio recording (a voice memo, meeting, interview or call).

- Answer only from the transcript. If it does not contain the answer, say so plainly instead of guessing.
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


def _params(system: List[dict], messages: List[dict]) -> dict:
    return dict(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=messages,
        output_config={"effort": "low"},  # chat: latency matters more than depth
    )


SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "claude-haiku-5-5")

SUMMARY_SYSTEM = """You write the title and the summary of an audio transcript (a voice memo, meeting, interview or call).
- Write both in the language of the transcript.
- title: at most 60 characters, says what it is about, no quotes, no trailing period, no date.
- summary: 2 to 3 plain sentences (no Markdown, no lists) with the essentials: the subject, the key points or decisions, and who is involved if it matters."""

SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {"title": {"type": "string"}, "summary": {"type": "string"}},
    "required": ["title", "summary"],
    "additionalProperties": False,
}


def summarize(transcript_text: str) -> dict:
    """A short title and summary for a transcript: {"title": ..., "summary": ...}."""
    response = _client().messages.create(
        model=SUMMARY_MODEL,
        max_tokens=1024,
        system=SUMMARY_SYSTEM,
        messages=[{"role": "user", "content": f"<transcript>\n{transcript_text}\n</transcript>"}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SUMMARY_SCHEMA}},
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("summary refused")
    data = json.loads(next(b.text for b in response.content if b.type == "text"))
    return {"title": data["title"].strip().strip('"\'').rstrip(".")[:80], "summary": data["summary"].strip()}


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
