import os
import logging
import requests
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Slack configuration from environment variables
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")


def send_to_slack_webhook(text: str, webhook_url: str = None, channel: str = None) -> dict:
    """
    Sends a message to Slack using an Incoming Webhook
    
    Args:
        text: Message text to send
        webhook_url: Slack webhook URL (optional if set in .env)
        channel: Optional channel override (e.g., "#general")
    
    Returns:
        dict with success status and message
    
    Setup:
        1. Go to https://api.slack.com/apps
        2. Create a new app or select existing
        3. Enable "Incoming Webhooks"
        4. Add webhook to workspace
        5. Copy webhook URL to .env as SLACK_WEBHOOK_URL
    """
    url = webhook_url or SLACK_WEBHOOK_URL
    
    if not url:
        raise Exception(
            "Slack webhook not configured. Provide webhook_url parameter or set SLACK_WEBHOOK_URL in .env. "
            "Get webhook URL from: https://api.slack.com/apps → Your App → Incoming Webhooks"
        )
    
    try:
        logger.info(f"Sending message to Slack via webhook")
        
        payload = {
            "text": text,
            "mrkdwn": True
        }
        
        if channel:
            payload["channel"] = channel
        
        response = requests.post(url, json=payload)
        
        if response.status_code == 200 and response.text == "ok":
            logger.info("Message sent successfully to Slack")
            return {
                "success": True,
                "message": "Message sent successfully to Slack",
                "provider": "Slack Webhook"
            }
        else:
            logger.error(f"Slack webhook error: {response.status_code} - {response.text}")
            raise Exception(f"Slack webhook error: {response.status_code} - {response.text}")
            
    except Exception as e:
        logger.error(f"Slack webhook error: {e}")
        raise Exception(f"Failed to send to Slack: {str(e)}")


def send_to_slack_api(text: str, channel: str, bot_token: str = None) -> dict:
    """
    Sends a message to Slack using the Web API (chat.postMessage)
    
    Args:
        text: Message text to send
        channel: Channel ID or name (e.g., "C1234567890" or "#general")
        bot_token: Slack bot token (optional if set in .env)
    
    Returns:
        dict with success status and message
    
    Setup:
        1. Go to https://api.slack.com/apps
        2. Create a new app or select existing
        3. Add "chat:write" bot token scope
        4. Install app to workspace
        5. Copy Bot User OAuth Token to .env as SLACK_BOT_TOKEN
    """
    token = bot_token or SLACK_BOT_TOKEN
    
    if not token:
        raise Exception(
            "Slack bot token not configured. Provide bot_token parameter or set SLACK_BOT_TOKEN in .env. "
            "Get bot token from: https://api.slack.com/apps → Your App → OAuth & Permissions"
        )
    
    try:
        logger.info(f"Sending message to Slack channel {channel} via API")
        
        url = "https://slack.com/api/chat.postMessage"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "channel": channel,
            "text": text,
            "mrkdwn": True
        }
        
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()
        
        if data.get("ok"):
            logger.info(f"Message sent successfully to Slack channel {channel}")
            return {
                "success": True,
                "message": f"Message sent successfully to Slack channel {channel}",
                "provider": "Slack API",
                "channel": data.get("channel"),
                "ts": data.get("ts")
            }
        else:
            error = data.get("error", "Unknown error")
            logger.error(f"Slack API error: {error}")
            raise Exception(f"Slack API error: {error}")
            
    except Exception as e:
        logger.error(f"Slack API error: {e}")
        raise Exception(f"Failed to send to Slack: {str(e)}")


def send_to_slack(text: str, channel: str = None, webhook_url: str = None, use_api: bool = False) -> dict:
    """
    Sends a message to Slack using either Webhook or API
    
    Args:
        text: Message text to send
        channel: Channel for API method (required if use_api=True)
        webhook_url: Webhook URL (optional if set in .env)
        use_api: If True, use API; otherwise use webhook
    
    Returns:
        dict with success status and message
    """
    if use_api:
        if not channel:
            raise Exception("Channel is required when using Slack API")
        return send_to_slack_api(text, channel)
    else:
        return send_to_slack_webhook(text, webhook_url, channel)


def handle_n2e_command(
    text: Optional[str] = None,
    file_url: Optional[str] = None,
    source_language: str = "en-IN",
    target_language: str = "en"
) -> dict:
    """
    Unified handler for /n2e command - handles BOTH text and voice translation.
    
    Intelligently routes to either text translation or voice translation based on input:
    - If `text` is provided: translates text directly
    - If `file_url` is provided: downloads audio, converts to text, then translates
    
    Args:
        text: Text to translate (mutually exclusive with file_url)
        file_url: Slack audio file URL (mutually exclusive with text)
        source_language: Source language code (default: "en-IN")
        target_language: Target language code (default: "en")
    
    Returns:
        dict with response_type and text for Slack (minimal, no extra words)
    
    Examples:
        # Text translation
        handle_n2e_command(text="Hello, how are you?", target_language="hi-IN")
        
        # Voice translation
        handle_n2e_command(file_url="https://files.slack.com/.../audio.wav")
    """
    logger.info(f"Unified /n2e handler: text={'provided' if text else 'None'}, file_url={'provided' if file_url else 'None'}")
    
    # Validate that at least one input is provided
    if not text and not file_url:
        return {
            "response_type": "ephemeral",
            "text": "Please provide either text or upload an audio file. Usage:\n• Text: `/n2e hello world`\n• Voice: Upload audio, then `/n2e`"
        }
    
    # Route to appropriate handler
    if text and text.strip():
        # Text translation path
        logger.info(f"Routing to text translation")
        return _handle_n2e_text(text, source_language, target_language)
    
    elif file_url and file_url.strip():
        # Voice translation path
        logger.info(f"Routing to voice translation")
        return _handle_n2e_voice(file_url, source_language, target_language)
    
    else:
        return {
            "response_type": "ephemeral",
            "text": "Invalid input. Please provide either text or a valid file URL."
        }


def _handle_n2e_text(text: str, source_language: str, target_language: str) -> dict:
    """
    Internal handler for text translation in /n2e command.
    
    Args:
        text: Text to translate
        source_language: Source language code
        target_language: Target language code
    
    Returns:
        dict with response_type and translated text
    """
    try:
        from services.sarvam_client import translate_text
        
        logger.info(f"Translating text: '{text[:50]}...' ({source_language} → {target_language})")
        
        # Translate text
        translated = translate_text(text, source_language, target_language)
        
        # Return ONLY the translated text
        return {
            "response_type": "in_channel",
            "text": translated
        }
    except Exception as e:
        logger.error(f"Text translation error in /n2e: {e}")
        return {
            "response_type": "ephemeral",
            "text": f"Error translating text: {str(e)[:100]}"
        }


def _handle_n2e_voice(file_url: str, source_language: str, target_language: str) -> dict:
    """
    Internal handler for voice translation in /n2e command.
    
    Args:
        file_url: Slack audio file URL
        source_language: Source language code
        target_language: Target language code
    
    Returns:
        dict with response_type and translated text
    """
    try:
        # Step 1: Download audio file from Slack
        logger.info("Step 1: Downloading audio from Slack...")
        audio_bytes = download_slack_file(file_url)
        
        # Step 2: Save to temporary file
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            temp_file.write(audio_bytes)
            temp_audio_path = temp_file.name
        
        logger.info(f"Step 2: Audio saved to temp file: {temp_audio_path}")
        
        try:
            # Step 3: Convert speech to text using Sarvam
            from services.sarvam_client import translate_speech_to_text, translate_text
            
            logger.info("Step 3: Converting speech to text...")
            stt_result = translate_speech_to_text(temp_audio_path, content_type="audio/wav")
            transcript = stt_result.get("transcript", "").strip()
            
            if not transcript:
                return {
                    "response_type": "ephemeral",
                    "text": "Could not transcribe audio. Please speak clearly and try again."
                }
            
            logger.info(f"Step 4: Transcribed text: '{transcript[:100]}'")
            
            # Step 4: Translate the transcribed text
            logger.info(f"Step 5: Translating from {source_language} to {target_language}...")
            translated = translate_text(transcript, source_language, target_language)
            
            # Step 5: Return ONLY the translated text
            logger.info(f"Translation result: '{translated[:100]}'")
            return {
                "response_type": "in_channel",
                "text": translated
            }
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)
                logger.info("Temp audio file cleaned up")
                
    except Exception as e:
        logger.error(f"Voice translation error in /n2e: {e}")
        return {
            "response_type": "ephemeral",
            "text": f"Error processing voice: {str(e)[:100]}"
        }


def handle_slash_command(command: str, text: str, source_language: str = "en", target_language: str = "en") -> dict:
    """
    Handles Slack slash commands for translation.
    Currently supports: /translatente, /translaten2e
    
    Args:
        command: The slash command (e.g., "/translatente")
        text: The text to process
        source_language: Source language code (default: "en")
        target_language: Target language code (default: "en")
    
    Returns:
        dict with response_type and text for Slack (minimal, no extra words)
    """
    logger.info(f"Handling slash command: {command}, text='{text[:50]}'")
    
    if command == "/translatente":
        if not text or not text.strip():
            return {
                "response_type": "ephemeral",
                "text": "Please provide text to translate. Usage: `/translatente <text>`"
            }
        
        try:
            from services.sarvam_client import translate_text
            
            # Call Sarvam translation
            translated = translate_text(text, source_language, target_language)
            
            # Return ONLY the translated text, no extra formatting
            return {
                "response_type": "in_channel",
                "text": translated
            }
        except Exception as e:
            logger.error(f"Translation error in slash command: {e}")
            return {
                "response_type": "ephemeral",
                "text": f"Error translating text: {str(e)}"
            }
    else:
        return {
            "response_type": "ephemeral",
            "text": f"Unknown command: {command}"
        }


def download_slack_file(file_url: str, bot_token: str = None) -> bytes:
    """
    Downloads a file from Slack using the file URL and bot token.
    
    Args:
        file_url: The file URL from Slack (e.g., from file or voice message)
        bot_token: Slack bot token (optional if set in .env)
    
    Returns:
        bytes: The file content
    
    Raises:
        Exception: If download fails
    """
    token = bot_token or SLACK_BOT_TOKEN
    
    if not token:
        raise Exception("Slack bot token not configured. Set SLACK_BOT_TOKEN in .env")
    
    try:
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        logger.info(f"Downloading file from Slack: {file_url[:80]}")
        response = requests.get(file_url, headers=headers)
        
        if response.status_code == 200:
            logger.info(f"File downloaded successfully: {len(response.content)} bytes")
            return response.content
        else:
            raise Exception(f"Failed to download file: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"File download error: {e}")
        raise


def handle_voice_translation(
    command: str,
    file_url: str,
    source_language: str = "en-IN",
    target_language: str = "en",
    bot_token: str = None
) -> dict:
    """
    Handles Slack slash commands for voice/audio translation.
    Supports: /translaten2e
    
    Flow:
    1. Download audio file from Slack
    2. Convert speech to text using Sarvam STT
    3. Translate the transcribed text
    4. Return only the translated text (no extra words)
    
    Args:
        command: The slash command (e.g., "/translaten2e")
        file_url: The file URL from Slack (voice message or uploaded audio)
        source_language: Source language code (default: "en-IN")
        target_language: Target language code (default: "en")
        bot_token: Slack bot token (optional if set in .env)
    
    Returns:
        dict with response_type and text for Slack
    """
    logger.info(f"Handling voice translation: {command}, file_url={file_url[:80]}")
    
    if command == "/translaten2e":
        try:
            # Step 1: Download audio file from Slack
            logger.info("Step 1: Downloading audio from Slack...")
            audio_bytes = download_slack_file(file_url, bot_token)
            
            # Step 2: Save to temporary file
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                temp_file.write(audio_bytes)
                temp_audio_path = temp_file.name
            
            logger.info(f"Step 2: Audio saved to temp file: {temp_audio_path}")
            
            try:
                # Step 3: Convert speech to text using Sarvam
                from services.sarvam_client import translate_speech_to_text, translate_text
                
                logger.info("Step 3: Converting speech to text...")
                stt_result = translate_speech_to_text(temp_audio_path, content_type="audio/wav")
                transcript = stt_result.get("transcript", "").strip()
                
                if not transcript:
                    return {
                        "response_type": "ephemeral",
                        "text": "Could not transcribe audio. Please speak clearly and try again."
                    }
                
                logger.info(f"Step 4: Transcribed text: '{transcript[:100]}'")
                
                # Step 4: Translate the transcribed text
                logger.info(f"Step 5: Translating from {source_language} to {target_language}...")
                translated = translate_text(transcript, source_language, target_language)
                
                # Step 5: Return ONLY the translated text
                logger.info(f"Translation result: '{translated[:100]}'")
                return {
                    "response_type": "in_channel",
                    "text": translated
                }
                
            finally:
                # Clean up temp file
                if os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)
                    logger.info("Temp audio file cleaned up")
                    
        except Exception as e:
            logger.error(f"Voice translation error: {e}")
            return {
                "response_type": "ephemeral",
                "text": f"Error processing voice: {str(e)[:100]}"
            }
    else:
        return {
            "response_type": "ephemeral",
            "text": f"Unknown voice command: {command}"
        }


def format_slack_message(text: str, tone: str = None, language: str = None) -> str:
    """
    Formats a message for Slack with markdown styling
    
    Args:
        text: The main text content
        tone: Optional tone style used
        language: Optional language
    
    Returns:
        Formatted Slack message with markdown
    """
    message = f"*🌍 Voice Translation App*\n\n{text}\n\n"
    
    if tone or language:
        message += "---\n"
        if tone:
            message += f"*Tone Style:* {tone}\n"
        if language:
            message += f"*Language:* {language}\n"
    
    message += "_Generated by Voice Translation App_"
    
    return message


def format_slack_blocks(text: str, tone: str = None, language: str = None) -> list:
    """
    Formats a message for Slack using Block Kit for rich formatting
    
    Args:
        text: The main text content
        tone: Optional tone style used
        language: Optional language
    
    Returns:
        List of Slack blocks
    """
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🌍 Voice Translation App",
                "emoji": True
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": text
            }
        }
    ]
    
    if tone or language:
        context_elements = []
        if tone:
            context_elements.append(f"*Tone:* {tone}")
        if language:
            context_elements.append(f"*Language:* {language}")
        
        blocks.append({
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": " | ".join(context_elements)
                }
            ]
        })
    
    blocks.append({
        "type": "divider"
    })
    
    blocks.append({
        "type": "context",
        "elements": [
            {
                "type": "mrkdwn",
                "text": "_Generated by Voice Translation App_"
            }
        ]
    })
    
    return blocks
