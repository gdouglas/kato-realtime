from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import secrets
import time
from jose import jwt
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from utils import verify_token
import httpx
import json

# Load environment variables
load_dotenv()

# Configure the app
app = FastAPI(title="Kato API Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Secret key for signing tokens
SECRET_KEY = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # Token expires after 60 minutes
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

class TokenResponse(BaseModel):
    token: str
    expires_at: int

class WebRTCRequest(BaseModel):
    sdp: str
    codec: Optional[str] = "opus"

def create_token(data: Dict[str, Any], expires_delta_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    """Create a new JWT token with expiration time"""
    to_encode = data.copy()
    expires_at = int(time.time()) + expires_delta_minutes * 60
    to_encode.update({"exp": expires_at})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt, expires_at

@app.get("/")
def read_root():
    return {"message": "Kato API Server is running"}

@app.post("/api/token", response_model=TokenResponse)
def generate_token():
    """Generate an ephemeral token for client authentication"""
    try:
        # Generate a unique identifier for this token
        token_id = secrets.token_hex(8)
        
        # Create payload with claims
        token_data = {
            "sub": token_id,
            "iat": int(time.time()),
            "type": "ephemeral"
        }
        
        # Generate the token
        token, expires_at = create_token(token_data)
        
        return {"token": token, "expires_at": expires_at}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")

@app.get("/api/protected")
def protected_route(token_data: Dict = Depends(verify_token)):
    """A protected endpoint that requires token authentication"""
    return {
        "message": "You have access to the protected endpoint",
        "token_data": {
            "sub": token_data.get("sub"),
            "type": token_data.get("type"),
            "expires_at": token_data.get("exp")
        }
    }

# Refactored from src/app/api/webrtc-exchange/route.ts
@app.post("/api/webrtc-exchange")
async def webrtc_exchange(request: WebRTCRequest):
    """WebRTC connection negotiation proxy to OpenAI"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/real-time/connection",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                },
                json={
                    "sdp": request.sdp,
                    "codec": request.codec,
                },
                timeout=30.0
            )
            
            if not response.is_success:
                return {"error": f"OpenAI API error: {response.status_code} {response.reason_phrase}"}, response.status_code
                
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in /webrtc-exchange: {str(e)}")

# Refactored from src/app/api/session/route.ts
@app.get("/api/session")
async def create_session():
    """Create a new realtime session with OpenAI"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                },
                json={
                    "model": "gpt-4o-mini-realtime-preview-2024-12-17",
                },
                timeout=30.0
            )
            
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in /session: {str(e)}")

# Refactored from src/app/api/chat/completions/route.ts
@app.post("/api/chat/completions")
async def chat_completions(request: Request):
    """Proxy for OpenAI chat completions API"""
    try:
        body = await request.json()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                },
                json=body,
                timeout=60.0
            )
            
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in /chat/completions: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 