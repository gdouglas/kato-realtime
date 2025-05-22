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

@router.post("/session")
async def create_session(settings: Settings = Depends(get_settings)):
    """Create a new realtime session with OpenAI."""
    try:
        # Ensure proper URL construction - OPENAI_BASE_URL already includes "/v1"
        base_url = settings.OPENAI_BASE_URL
        if base_url.endswith('/v1'):
            base_url = base_url[:-3]  # Remove the "/v1" from the end
            
        session_url = f"{base_url}/v1/realtime/sessions"
        
        # Create request body with necessary parameters
        request_body = {
            "model": settings.OPENAI_MODEL,
            "modalities": ["audio", "text"],
            "instructions": ""
        }
        
        # Make the request to OpenAI
        async with httpx.AsyncClient() as client:
            response = await client.post(
                session_url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                },
                json=request_body,
                timeout=30.0
            )
            
            # Handle errors
            if not response.is_success:
                logger.error(f"OpenAI API error: {response.status_code} {response.reason_phrase}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI API error: {response.status_code} {response.reason_phrase}"
                )
            
            # Process successful response
            openai_response_data = response.json()
            
            # Handle client_secret formatting for frontend compatibility
            if "client_secret" in openai_response_data and openai_response_data["client_secret"]:
                # Extract client_secret value, handling potential nested structure
                client_secret = openai_response_data["client_secret"]
                
                if isinstance(client_secret, dict) and "value" in client_secret:
                    client_secret_value = client_secret["value"]
                else:
                    client_secret_value = client_secret
                
                # Return formatted response
                formatted_data = {
                    "client_secret": {
                        "value": client_secret_value
                    },
                    "id": openai_response_data.get("id"),
                    "expires_at": openai_response_data.get("expires_at")
                }
                return formatted_data
            else:
                logger.error(f"OpenAI response missing client_secret: {openai_response_data}")
                raise HTTPException(
                    status_code=500, 
                    detail="OpenAI response did not contain a client_secret"
                )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in /session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error in /session: {str(e)}") 