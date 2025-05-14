"""Authentication related routes."""

import secrets
import time
import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from utils import verify_token, create_token
from config import Settings, get_settings

# Get module logger
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["Authentication"])

class TokenResponse(BaseModel):
    token: str
    expires_at: int

@router.post("/api/token", response_model=TokenResponse)
async def generate_token(settings: Settings = Depends(get_settings)):
    """Generate an ephemeral token for client authentication."""
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
        token, expires_at = create_token(token_data, settings)
        
        return {"token": token, "expires_at": expires_at}
    except Exception as e:
        logger.error(f"Failed to generate token: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")

@router.get("/api/protected")
async def protected_route(token_data: Dict = Depends(verify_token)):
    """A protected endpoint that requires token authentication."""
    return {
        "message": "You have access to the protected endpoint",
        "token_data": {
            "sub": token_data.get("sub"),
            "type": token_data.get("type"),
            "expires_at": token_data.get("exp")
        }
    } 