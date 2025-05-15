# Kato API Server

A FastAPI server that provides endpoints for the Kato realtime application, including token generation and OpenAI API proxies.

## Project Structure

The server uses a modular structure for better organization:

```
server/
├── __init__.py         # Package initialization and convenient imports
├── __main__.py         # Module entry point for running as a module
├── app.py              # FastAPI application definition
├── main.py             # Server startup and configuration
├── config.py           # Centralized settings with Pydantic
├── utils.py            # Utility functions (token handling, etc.)
├── run.py              # Simple entry script for running from any directory
├── routes/             # API routes package
│   ├── __init__.py     # Package initialization
│   ├── auth.py         # Authentication routes 
│   ├── webrtc.py       # WebRTC exchange routes
│   ├── session.py      # Session management routes
│   └── chat.py         # Chat completion routes
└── pyproject.toml      # Project metadata and dependencies
```

### Module Responsibilities

- **app.py**: Contains the FastAPI application definition, middleware, and route inclusion
- **main.py**: Contains server startup code and configuration
- **__main__.py**: Entry point for running the package as a module
- **__init__.py**: Package initialization, centralized logging setup, and exports important objects
- **config.py**: Centralized settings management using Pydantic's BaseSettings
- **run.py**: Simplified entry point script that can be run from any directory

### Design Patterns

#### Centralized Logging
- Logging is configured once in `__init__.py`
- Each module gets its own logger with `logger = logging.getLogger(__name__)`
- Ensures consistent log format across the application

#### Settings Management
- Environment variables are managed with Pydantic's `BaseSettings` in `config.py`
- Settings are validated at startup with custom validators
- Settings are accessed through FastAPI's dependency injection system
- Example:
  ```python
  @app.get("/endpoint")
  async def endpoint(settings: Settings = Depends(get_settings)):
      # Use settings.SOME_SETTING
  ```

## Setup with UV

[UV](https://github.com/astral-sh/uv) is a fast Python package installer and resolver. This project uses UV for dependency management.

1. Install UV (if not already installed):
   ```
   curl -fsSL https://astral.sh/uv/install.sh | bash
   ```

2. Create a virtual environment with UV:
   ```
   uv venv
   ```

3. Activate the virtual environment:
   - On Windows:
     ```
     .venv\Scripts\activate
     ```
   - On macOS/Linux:
     ```
     source .venv/bin/activate
     ```

4. Install dependencies with UV (directly from pyproject.toml):
   ```
   uv sync
   ```

5. Create a `.env` file with your configuration (see `env.example` for reference):
   ```
   JWT_SECRET_KEY=your-secret-key-here
   OPENAI_API_KEY=your-openai-api-key-here
   ```

## Environment Variables

The application uses the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| HOST | Host to bind the server | 0.0.0.0 |
| PORT | Port to bind the server | 8000 |
| JWT_SECRET_KEY | Secret key for JWT token signing | (Required) |
| ALGORITHM | JWT signing algorithm | HS256 |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token expiration time | 60 |
| OPENAI_API_KEY | OpenAI API key | (Required) |
| OPENAI_BASE_URL | OpenAI API base URL | https://api.openai.com/v1 |
| OPENAI_MODEL | OpenAI model to use | gpt-4o-mini-realtime-preview-2024-12-17 |

## Development

Install development dependencies:
```
uv add --dev pytest pytest-asyncio ruff
```

To add a new dependency:
```
uv add fastapi httpx
```

To remove a dependency:
```
uv remove package-name
```

To update a dependency:
```
uv lock --upgrade-package package-name
```

## Running the Server

There are several ways to run the server:

### Method 1: Using the run.py script (recommended)
This simple script works from any directory:
```
# Inside server directory
python run.py

# From outside server directory
python server/run.py
```

### Method 2: Using UV run with main.py
This method ensures the environment is synced before running:
```
# Inside server directory
uv run main.py
```

### Method 3: Using module notation
To run as a module, you need to be in the parent directory:
```
# From the directory containing the server directory
uv run -m server
```

### Method 4: Using uvicorn directly
```
# Inside server directory
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

### Authentication
- `GET /`: Health check
- `POST /v1/token`: Generate a new ephemeral token
- `GET /v1/protected`: Protected route example (requires token)

### OpenAI API Proxies
- `POST /v1/webrtc-exchange`: WebRTC connection negotiation proxy to OpenAI
- `POST /v1/session`: Create a new realtime session with OpenAI
- `POST /v1/chat/completions`: Proxy for OpenAI chat completions API

## API Documentation

Once the server is running, access the interactive API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc 