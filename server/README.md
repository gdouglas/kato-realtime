# Kato API Server

A FastAPI server that provides endpoints for the Kato realtime application, including token generation and OpenAI API proxies.

## Setup

1. Create a virtual environment:
   ```
   python -m venv venv
   ```

2. Activate the virtual environment:
   - On Windows:
     ```
     venv\Scripts\activate
     ```
   - On macOS/Linux:
     ```
     source venv/bin/activate
     ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Create a `.env` file with your configuration:
   ```
   JWT_SECRET_KEY=your-secret-key-here
   OPENAI_API_KEY=your-openai-api-key-here
   ```
   If you don't set JWT_SECRET_KEY, a random secret will be generated each time the server starts (not recommended for production).

## Running the Server

Start the server with:
```
python main.py
```

Or using uvicorn directly:
```
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

### Authentication
- `GET /`: Health check
- `POST /api/token`: Generate a new ephemeral token
- `GET /api/protected`: Protected route example (requires token)

### OpenAI API Proxies
- `POST /api/webrtc-exchange`: WebRTC connection negotiation proxy to OpenAI
- `GET /api/session`: Create a new realtime session with OpenAI
- `POST /api/chat/completions`: Proxy for OpenAI chat completions API

## API Documentation

Once the server is running, access the interactive API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc 