"""Chat completion routes."""

import logging
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse

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

@router.post("/audio/speech")
async def audio_speech(
    request: Request,
    settings: Settings = Depends(get_settings)
):
    """Proxy for OpenAI text-to-speech API."""
    try:
        body = await request.json()
        text_input = body.get("input")
        model = body.get("model", "tts-1") # Default model if not provided
        voice = body.get("voice", "alloy") # Default voice if not provided
        instructions = body.get("instructions")

        if not text_input:
            raise HTTPException(status_code=400, detail="Missing 'input' field in request body")

        openai_payload = {
            "model": model,
            "input": text_input,
            "voice": voice,
        }
        if instructions:
            # According to OpenAI documentation, instructions are not a standard parameter for tts-1 or tts-1-hd.
            # This might be for newer models or a misunderstanding from the JS snippet.
            # For now, we will only include it if the model is 'gpt-4o-mini-tts' as in the example.
            # Or, we can decide to always pass it if the API handles unknown params gracefully.
            # For safety, let's check the model. The JS example uses 'gpt-4o-mini-tts'.
            # Standard models are 'tts-1' and 'tts-1-hd'.
            # The example seems to use a model not listed in the general TTS docs.
            # Let's assume 'instructions' is a valid parameter for the specified 'gpt-4o-mini-tts'.
            # For other models, we might want to omit it or log a warning.
            # The example uses 'gpt-4o-mini-tts', let's adhere to that if 'instructions' are provided.
            if model == "gpt-4o-mini-tts" and instructions:
                 openai_payload["instructions"] = instructions
            elif instructions:
                logger.warning(f"Instructions provided for model '{model}', but 'instructions' parameter is typically for specific models like 'gpt-4o-mini-tts'. Passing it anyway.")
                # If we are sure 'instructions' is only for 'gpt-4o-mini-tts', we could choose to not pass it for other models.
                # openai_payload["instructions"] = instructions # Pass it if we want to be more flexible or if API ignores it.
                # For now, only add if model is the specific one from example.
                # Let's assume for now the example model 'gpt-4o-mini-tts' is what will be used if instructions are present.
                # The JS example *sets* model to 'gpt-4o-mini-tts'. We should ensure our payload reflects this.
                # If 'instructions' are present, we should probably ensure the model is one that supports it.
                # The JS snippet sets the model: `model: 'gpt-4o-mini-tts'`
                # So if instructions are present, the model *should* be 'gpt-4o-mini-tts'.
                # Let's adjust: if instructions are given, we assume the model from the example or what the user sends.
                openai_payload["instructions"] = instructions


        speech_url = urljoin(settings.OPENAI_BASE_URL, "/v1/audio/speech")
        
        logger.info(f"Requesting TTS from OpenAI: {speech_url} with model {openai_payload.get('model')} and voice {openai_payload.get('voice')}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                speech_url,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=openai_payload,
                timeout=60.0  # Adjust timeout as needed for TTS
            )

            if not response.is_success:
                error_content = await response.aread()
                logger.error(f"OpenAI TTS API error: {response.status_code} {response.reason_phrase} - {error_content.decode()}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI TTS API error: {response.status_code} {response.reason_phrase} - {error_content.decode()}"
                )
            
            # Stream the audio content back
            # The OpenAI API returns the audio directly in the response body.
            # The Content-Type from OpenAI will be something like 'audio/mpeg'.
            # We should pass this Content-Type along.
            response_headers = {"Content-Type": response.headers.get("Content-Type", "audio/mpeg")}
            
            return StreamingResponse(response.aiter_bytes(), media_type=response.headers.get("Content-Type", "audio/mpeg"), headers=response_headers)

    except HTTPException:
        raise # Re-raise HTTPException to ensure FastAPI handles them correctly
    except Exception as e:
        logger.error(f"Error in /audio/speech: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error in /audio/speech: {str(e)}") 