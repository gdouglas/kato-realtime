"""Chat completion routes."""

import logging
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends

from config import Settings, get_settings

# Get module logger
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["Chat"])

@router.post("/chat/completions")
async def chat_completions(
    request: Request,
    settings: Settings = Depends(get_settings)
):
    """Proxy for OpenAI chat completions API."""
    try:
        body = await request.json()
        
        completions_url = urljoin(settings.OPENAI_BASE_URL, "/v1/chat/completions")
        async with httpx.AsyncClient() as client:
            response = await client.post(
                completions_url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                },
                json=body,
                timeout=60.0
            )
            
            logger.error(f"Calling: {completions_url}")
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
        logger.error(f"Error in /chat/completions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error in /chat/completions: {str(e)}") 