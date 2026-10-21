# AI Chat Feature Documentation

## Overview

The AI Chat feature allows you to have intelligent conversations about your audio transcripts using Anthropic's Claude models. Ask questions, get summaries, extract insights, and analyze your transcripts conversationally.

## Features

- **Context-Aware Conversations**: AI has full access to the transcript content
- **Chat History**: Maintains conversation context across multiple messages
- **Split-View Interface**: View transcript and chat side-by-side
- **Persistent Storage**: Chat history is saved to database
- **Multi-Transcript Support**: Separate chat history for each transcript

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

New dependency added: `anthropic>=1.0.0`

### 2. Get an Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (starts with `sk-...`)

### 3. Configure Environment

Add to your `.env` file:

```bash
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
# Optional: CHAT_MODEL=claude-haiku-5-5 for a cheaper, faster chat (default: claude-sonnet-5-5)
```

### 4. Database Migration

The feature adds new tables. If you're using an existing database:

**For SQLite (Development):**
```bash
# Delete old database to recreate with new schema
rm voice_transcript.db
python -c "from api.database import init_db; init_db()"
```

**For PostgreSQL (Production):**
The tables will be created automatically on first run, or you can run:
```python
from api.database import init_db
init_db()
```

## Database Schema

### New Tables

**`transcripts`**
- Stores full transcript text and metadata
- Links to user who created it
- Contains both text and JSON versions

**`chat_messages`**
- Stores conversation history
- Links to specific transcript
- Tracks role (user/assistant) and timestamp

## API Endpoints

### List Transcripts
```http
GET /transcripts/list
Authorization: Bearer <token>
```

Returns all transcripts for authenticated user.

### Send Chat Message
```http
POST /chat/{transcript_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "What are the main topics discussed?"
}
```

Returns AI response with chat history context.

### Get Chat History
```http
GET /chat/{transcript_id}/history
Authorization: Bearer <token>
```

Returns all messages for a transcript.

### Clear Chat History
```http
DELETE /chat/{transcript_id}/history
Authorization: Bearer <token>
```

Deletes all chat messages for a transcript.

## Usage

### 1. Upload and Transcribe Audio

Upload an audio file as usual. The transcript is now automatically saved to the database.

### 2. Open Transcript Viewer

Click on any transcript to view it.

### 3. Enable AI Chat

Click the "AI Chat" button in the transcript viewer to open the chat interface.

### 4. Ask Questions

Examples of questions you can ask:

- "Summarize this transcript in 3 bullet points"
- "What are the key action items mentioned?"
- "Who are the speakers and what are their main points?"
- "Extract all dates and deadlines mentioned"
- "What questions were asked during this conversation?"
- "Translate the main points to French"
- "What technical terms are used?"

### 5. View Chat History

All conversations are saved. When you reopen a transcript, your previous chat history loads automatically.

## Frontend Components

### ChatInterface.jsx

Main chat component with:
- Message display (user/assistant)
- Input field with send button
- Loading states
- Error handling
- Auto-scroll to latest message
- Clear history button

### Updated TranscriptViewer.jsx

Enhanced with:
- Split-view layout
- Chat toggle button
- Responsive design (50/50 split when chat is open)
- Database ID tracking

## Cost Considerations

### Anthropic Pricing (as of 2024)

**GPT-4o-mini** (default model):
- Input: $0.150 / 1M tokens
- Output: $0.600 / 1M tokens

**GPT-4**:
- Input: $30.00 / 1M tokens
- Output: $60.00 / 1M tokens

### Estimated Costs

For a 1000-word transcript (~1500 tokens):
- **GPT-4o-mini**: ~$0.001 per question
- **GPT-4**: ~$0.05 per question

### Cost Optimization

1. **Use GPT-4o-mini** (default): 200x cheaper than GPT-4
2. **Limit chat history**: Currently limited to last 20 messages
3. **Set max_tokens**: Limited to 1000 tokens per response
4. **Monitor usage**: Check Anthropic dashboard regularly

## Changing AI Model

Edit `api/app.py`, line ~298:

```python
response = client.chat.completions.create(
    model="gpt-4o-mini",  # Change to "gpt-4", "gpt-4-turbo", etc.
    messages=messages,
    max_tokens=1000,
    temperature=0.7
)
```

Available models:
- `gpt-4o-mini` - Cheapest, fast, good quality
- `gpt-4o` - Latest, balanced
- `gpt-4-turbo` - High quality, expensive
- `gpt-4` - Highest quality, most expensive

## Troubleshooting

### "ANTHROPIC_API_KEY not configured"

**Solution**: Add `ANTHROPIC_API_KEY` to your `.env` file

### "Transcript not found"

**Solution**: 
- Ensure you're viewing a newly uploaded transcript
- Old transcripts (before this feature) won't have `database_id`
- Re-upload the audio file

### Chat not showing

**Solution**:
- Check browser console for errors
- Verify `database_id` is present in transcript object
- Ensure backend is running and accessible

### Rate limit errors

**Solution**:
- Anthropic has rate limits (3 requests/min for free tier)
- Upgrade to paid tier for higher limits
- Add retry logic with exponential backoff

## Security Considerations

1. **API Key Protection**: Never commit `.env` file to git
2. **User Isolation**: Users can only chat with their own transcripts
3. **Input Validation**: Messages are validated before sending to Anthropic
4. **Token Limits**: Max tokens prevent excessive API costs

## Production Deployment

### Environment Variables

Add to Coolify/production:

```bash
ANTHROPIC_API_KEY=sk-ant-your-production-key
```

### Database

Ensure PostgreSQL is configured:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
```

### Monitoring

Monitor:
- Anthropic API usage in dashboard
- Database size (chat history grows over time)
- Response times
- Error rates

## Future Enhancements

Potential improvements:

1. **Streaming Responses**: Real-time token streaming
2. **Voice Input**: Ask questions via voice
3. **Export Chats**: Download conversation history
4. **Custom Prompts**: User-defined system prompts
5. **Multi-Language**: Automatic language detection
6. **Embeddings**: Semantic search across transcripts
7. **RAG**: Retrieve relevant transcript sections
8. **Analytics**: Track popular questions and insights

## Example Use Cases

### Meeting Analysis
```
User: "What were the main decisions made in this meeting?"
AI: "Based on the transcript, three main decisions were made:
1. Launch date set for Q2 2024
2. Budget approved at $50K
3. Sarah assigned as project lead"
```

### Interview Insights
```
User: "What skills did the candidate mention?"
AI: "The candidate highlighted these skills:
- Python and JavaScript programming
- 5 years of React experience
- Team leadership and mentoring
- Agile/Scrum methodology"
```

### Lecture Summary
```
User: "Summarize this lecture in simple terms"
AI: "This lecture covered photosynthesis - how plants convert 
sunlight into energy. Key points:
- Chlorophyll captures light
- CO2 + water → glucose + oxygen
- Happens in chloroplasts"
```

## Support

For issues or questions:
1. Check logs: `docker-compose logs backend`
2. Verify environment variables
3. Test API endpoints directly
4. Check Anthropic status page

## License

Same as main project license.
