"""Configuration settings for the Kato API Server."""

from pydantic_settings import BaseSettings
from pydantic import Field, field_validator, HttpUrl, ConfigDict
from typing import List, Optional
import logging
import os

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Security settings
    JWT_SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    # OpenAI API settings
    OPENAI_API_KEY: str
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini-realtime-preview-2024-12-17"
    
    # CORS settings
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "https://kato-app.example.com"]
    
    @field_validator("JWT_SECRET_KEY", mode='before')
    def validate_jwt_secret(cls, v):
        if not v or len(v) < 32:
            logger.warning("JWT_SECRET_KEY is missing or too short. Using an insecure default key.")
            return "insecure-dev-key-please-change-in-production-not-safe"
        return v
    
    @field_validator("OPENAI_API_KEY", mode='before')
    def validate_openai_api_key(cls, v):
        if not v:
            logger.warning("OPENAI_API_KEY is missing or empty. OpenAI API calls will fail.")
        return v
        
    model_config = ConfigDict(env_file=".env", case_sensitive=True, extra='ignore')

# Create global settings instance
settings = Settings()

def get_settings():
    """Dependency function to get settings for FastAPI dependency injection."""
    return settings 