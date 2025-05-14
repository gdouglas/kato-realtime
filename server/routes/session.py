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

@router.post("/api/session")
async def create_session(settings: Settings = Depends(get_settings)):
    """Create a new realtime session with OpenAI."""
    try:
        # The OPENAI_BASE_URL already includes "/v1", so avoid adding it again
        base_url = settings.OPENAI_BASE_URL
        if base_url.endswith('/v1'):
            base_url = base_url[:-3]  # Remove the "/v1" from the end
            
        # Try different possible paths
        # 1. Standard path
        session_url = f"{base_url}/v1/realtime/sessions"
        
        print("----- DEBUG INFO -----")
        print(f"Using URL: {session_url}")
        print(f"API Key (first 5): {settings.OPENAI_API_KEY[:5] if settings.OPENAI_API_KEY else 'None'}")
        print(f"Model: {settings.OPENAI_MODEL}")
        
        # Create a more complete request body with additional parameters
        request_body = {
            "model": settings.OPENAI_MODEL,
            "modalities": ["audio", "text"],  # Add modalities
            "instructions": "You are a helpful assistant."  # Add basic instructions
        }
        
        print(f"Full request body: {request_body}")
        
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
            
            print(f"OpenAI Response Status: {response.status_code}")
            print(f"OpenAI Response Reason: {response.reason_phrase}")
            
            # Try to get the raw response body
            try:
                # For async HTTPX client, response.text is a coroutine that must be awaited
                response_body = await response.text()
                print(f"OpenAI Response Body: {response_body}")
                
                # Try to parse as JSON for more details if possible
                try:
                    # response.json() is synchronous in this version of HTTPX
                    response_json = response.json()
                    print(f"OpenAI Response JSON: {response_json}")
                    if 'error' in response_json:
                        print(f"OpenAI Error Details: {response_json['error']}")
                except Exception as json_err:
                    # Not JSON or JSON parsing failed
                    print(f"Could not parse response as JSON: {str(json_err)}")
            except Exception as e:
                print(f"Error reading response body: {str(e)}")

            if not response.is_success:
                logger.error(f"OpenAI API error: {response.status_code} {response.reason_phrase}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI API error: {response.status_code} {response.reason_phrase}"
                )
                
            # response.json() is synchronous in this version of HTTPX
            openai_response_data = response.json()
            
            # Assuming OpenAI returns a flat client_secret string, as suggested by search results.
            # We need to wrap it in the format expected by App.tsx.
            if "client_secret" in openai_response_data and openai_response_data["client_secret"]:
                # Get the client secret value, handling the case where it might be a nested object
                client_secret = openai_response_data["client_secret"]
                
                # If client_secret is an object with a 'value' field
                if isinstance(client_secret, dict) and "value" in client_secret:
                    client_secret_value = client_secret["value"]
                else:
                    # Otherwise use it directly
                    client_secret_value = client_secret
                
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