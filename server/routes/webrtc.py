"""WebRTC related routes."""

import logging
from typing import Optional
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from config import Settings, get_settings

# Get module logger
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["WebRTC"])

class WebRTCRequest(BaseModel):
    sdp: str
    codec: Optional[str] = Field(default="opus", description="Audio codec to use")

@router.post("/api/webrtc-exchange")
async def webrtc_exchange(
    request: WebRTCRequest,
    settings: Settings = Depends(get_settings)
):
    """WebRTC connection negotiation proxy to OpenAI."""
    try:
        webrtc_url = urljoin(settings.OPENAI_BASE_URL, "audio/real-time/connection")
        async with httpx.AsyncClient() as client:
            response = await client.post(
                webrtc_url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                },
                json={
                    "sdp": request.sdp,
                    "codec": request.codec,
                },
                timeout=30.0
            )
            
            if not response.is_success:
                logger.error(f"OpenAI API error: {response.status_code} {response.reason_phrase}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI API error: {response.status_code} {response.reason_phrase}"
                )
                
            return response.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in /webrtc-exchange: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error in /webrtc-exchange: {str(e)}") 