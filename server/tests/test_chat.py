"""Tests for chat completion routes."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

def test_chat_completions_success(client):
    """Test successful chat completion."""
    # Test request payload
    request_data = {
        "model": "gpt-4o-mini-realtime-preview-2024-12-17",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello, world!"}
        ]
    }
    
    # Mock the OpenAI API response
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1677858242,
        "model": "gpt-4o-mini-realtime-preview-2024-12-17",
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Hello! How can I help you today?"
                },
                "finish_reason": "stop",
                "index": 0
            }
        ],
        "usage": {
            "prompt_tokens": 13,
            "completion_tokens": 12,
            "total_tokens": 25
        }
    }
    
    # Patch the httpx AsyncClient post method
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        response = client.post("/v1/chat/completions", json=request_data)
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert "choices" in data
        assert len(data["choices"]) > 0
        assert data["choices"][0]["message"]["content"] == "Hello! How can I help you today?"

def test_chat_completions_api_error(client):
    """Test error handling when OpenAI API fails."""
    # Test request payload
    request_data = {
        "model": "gpt-4o-mini-realtime-preview-2024-12-17",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello, world!"}
        ]
    }
    
    # Mock the httpx response for an error
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 400
    mock_response.reason_phrase = "Bad Request"
    
    # Patch the httpx AsyncClient post method
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        response = client.post("/v1/chat/completions", json=request_data)
        
        # Assertions
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "OpenAI API error" in data["detail"] 