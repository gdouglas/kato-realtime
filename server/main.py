from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import secrets
import time
from jose import jwt
from typing import Dict, Any
from dotenv import load_dotenv
from utils import verify_token

# Load environment variables
load_dotenv()

# Configure the app
app = FastAPI(title="Token API")

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

class TokenResponse(BaseModel):
    token: str
    expires_at: int

def create_token(data: Dict[str, Any], expires_delta_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    """Create a new JWT token with expiration time"""
    to_encode = data.copy()
    expires_at = int(time.time()) + expires_delta_minutes * 60
    to_encode.update({"exp": expires_at})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt, expires_at

@app.get("/")
def read_root():
    return {"message": "Token API is running"}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 