"""Session management routes."""

import logging
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, HTTPException, Depends

from config import Settings, get_settings

# Get module logger
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["Sessions"])

@router.get("/api/session")
async def create_session(settings: Settings = Depends(get_settings)):
    """Create a new realtime session with OpenAI."""
    try:
        session_url = urljoin(settings.OPENAI_BASE_URL, "realtime/sessions")
        async with httpx.AsyncClient() as client:
            response = await client.post(
                session_url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                },
                json={
                    "model": settings.OPENAI_MODEL,
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
        logger.error(f"Error in /session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error in /session: {str(e)}") 