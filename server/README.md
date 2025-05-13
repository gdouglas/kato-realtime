# FastAPI Token Server

A simple API server that provides endpoints for generating ephemeral JWT tokens.

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
   ```
   If you don't set this, a random secret will be generated each time the server starts (not recommended for production).

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

- `GET /`: Health check
- `POST /api/token`: Generate a new ephemeral token

## API Documentation

Once the server is running, access the interactive API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc 