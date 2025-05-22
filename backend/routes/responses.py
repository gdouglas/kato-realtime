"""OpenAI /responses endpoint proxy."""

import logging
from fastapi import APIRouter, HTTPException, Request, Depends
from openai import AsyncOpenAI, APIStatusError, APIConnectionError
from config import Settings, get_settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Responses"])

@router.post("/responses") # This will be prefixed with /api/v1 in app.py
async def forward_to_openai_responses(
    request: Request,
    settings: Settings = Depends(get_settings)
):
    """
    Receives requests and sends them to the OpenAI /responses endpoint
    (relative to OPENAI_BASE_URL) using the Python SDK.
    """
    try:
        request_body = await request.json()

        client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL, 
            # Default timeout is 10 minutes, connect timeout is 60s.
            # Adjust with `timeout=` if needed, or `httpx.Timeout` object.
        )

        # The path "/responses" is relative to the client.base_url.
        # If OPENAI_BASE_URL is "https://api.openai.com/v1", this targets 
        # "https://api.openai.com/v1/responses".
        api_response = await client.post(
            "/responses",
            body=request_body,
            cast_to=object # Parses JSON response into a dict/list or Pydantic model
        )
        
        return api_response

    except APIStatusError as e:
        # Error response from OpenAI (e.g., 4xx, 5xx)
        error_detail = f"OpenAI API error: {e.status_code}"
        try:
            # Try to parse the error response from OpenAI
            error_content = e.response.json()
            error_message = error_content.get("error", {}).get("message")
            if error_message:
                error_detail = f"{error_detail} - {error_message}"
            else:
                error_detail = f"{error_detail} - {e.response.text}"
        except Exception:
            # Fallback if parsing response fails
            error_detail = f"{error_detail} - {e.response.text}"
        
        logger.error(f"OpenAI API Status Error for /responses: {error_detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=error_detail
        )
    except APIConnectionError as e:
        # Network-level error (e.g., DNS failure, connection refused)
        logger.error(f"OpenAI API Connection Error for /responses: {e}")
        raise HTTPException(status_code=503, detail=f"OpenAI API connection error: {str(e)}") # 503 Service Unavailable
    except HTTPException:
        # Re-raise if it's already an HTTPException (e.g., from request.json() if invalid JSON)
        raise
    except Exception as e:
        # Catch-all for other unexpected errors
        logger.error(f"Unexpected error in /responses route: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error in /responses: {str(e)}") 