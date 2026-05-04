import os
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# LinkedIn configuration from environment variables
LINKEDIN_ACCESS_TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN", "")
LINKEDIN_PERSON_URN = os.getenv("LINKEDIN_PERSON_URN", "")


def share_to_linkedin(text: str, access_token: str = None, person_urn: str = None) -> dict:
    """
    Shares a post to LinkedIn using the Share API
    
    Args:
        text: Post content
        access_token: LinkedIn access token (optional if set in .env)
        person_urn: LinkedIn person URN (optional if set in .env)
    
    Returns:
        dict with success status and message
    
    Setup:
        1. Create a LinkedIn App at https://www.linkedin.com/developers/apps
        2. Add "Share on LinkedIn" product
        3. Request "w_member_social" permission
        4. Implement OAuth 2.0 flow to get access token
        5. Get person URN from /v2/me endpoint
        6. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN in .env
    
    OAuth Flow:
        1. Redirect user to: https://www.linkedin.com/oauth/v2/authorization
           ?response_type=code
           &client_id={YOUR_CLIENT_ID}
           &redirect_uri={YOUR_REDIRECT_URI}
           &scope=w_member_social
        2. Exchange code for access token at: https://www.linkedin.com/oauth/v2/accessToken
        3. Get person URN from: https://api.linkedin.com/v2/me
    
    Note:
        This is a placeholder implementation. Full OAuth flow should be implemented
        in a production environment with proper token management and refresh logic.
    """
    token = access_token or LINKEDIN_ACCESS_TOKEN
    urn = person_urn or LINKEDIN_PERSON_URN
    
    if not token or not urn:
        raise Exception(
            "LinkedIn not configured. This requires OAuth authentication. "
            "Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN in .env, "
            "or implement OAuth flow. See: https://docs.microsoft.com/en-us/linkedin/shared/authentication/authentication"
        )
    
    try:
        logger.info("Sharing post to LinkedIn")
        
        url = "https://api.linkedin.com/v2/ugcPosts"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }
        
        payload = {
            "author": urn,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {
                        "text": text
                    },
                    "shareMediaCategory": "NONE"
                }
            },
            "visibility": {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
            }
        }
        
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code in [200, 201]:
            data = response.json()
            post_id = data.get("id", "")
            logger.info(f"Post shared successfully to LinkedIn: {post_id}")
            return {
                "success": True,
                "message": "Post shared successfully to LinkedIn",
                "provider": "LinkedIn",
                "post_id": post_id
            }
        else:
            logger.error(f"LinkedIn API error: {response.status_code} - {response.text}")
            raise Exception(f"LinkedIn API error: {response.status_code} - {response.text}")
            
    except Exception as e:
        logger.error(f"LinkedIn share error: {e}")
        raise Exception(f"Failed to share to LinkedIn: {str(e)}")


def format_linkedin_post(text: str, tone: str = None, language: str = None, add_hashtags: bool = True) -> str:
    """
    Formats a post for LinkedIn with appropriate styling and hashtags
    
    Args:
        text: The main text content
        tone: Optional tone style used
        language: Optional language
        add_hashtags: Whether to add relevant hashtags
    
    Returns:
        Formatted LinkedIn post
    """
    post = text
    
    # Add metadata if provided
    if tone or language:
        post += "\n\n---\n"
        if tone:
            post += f"Tone: {tone}\n"
        if language:
            post += f"Language: {language}\n"
    
    # Add hashtags
    if add_hashtags:
        hashtags = [
            "#VoiceTranslation",
            "#AI",
            "#LanguageTechnology",
            "#Communication"
        ]
        
        # Add language-specific hashtags
        if language:
            if "hi" in language.lower():
                hashtags.append("#Hindi")
            elif "ta" in language.lower():
                hashtags.append("#Tamil")
            elif "bn" in language.lower():
                hashtags.append("#Bengali")
        
        post += "\n\n" + " ".join(hashtags)
    
    # Add attribution
    post += "\n\n🌍 Generated by Voice Translation App"
    
    return post


def get_linkedin_auth_url(client_id: str, redirect_uri: str, state: str = None) -> str:
    """
    Generates the LinkedIn OAuth authorization URL
    
    Args:
        client_id: Your LinkedIn app client ID
        redirect_uri: Your OAuth redirect URI
        state: Optional state parameter for CSRF protection
    
    Returns:
        Authorization URL to redirect user to
    """
    base_url = "https://www.linkedin.com/oauth/v2/authorization"
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "w_member_social r_liteprofile"
    }
    
    if state:
        params["state"] = state
    
    query_string = "&".join([f"{k}={v}" for k, v in params.items()])
    return f"{base_url}?{query_string}"


def exchange_code_for_token(code: str, client_id: str, client_secret: str, redirect_uri: str) -> dict:
    """
    Exchanges authorization code for access token
    
    Args:
        code: Authorization code from OAuth callback
        client_id: Your LinkedIn app client ID
        client_secret: Your LinkedIn app client secret
        redirect_uri: Your OAuth redirect URI
    
    Returns:
        dict with access_token and expires_in
    """
    url = "https://www.linkedin.com/oauth/v2/accessToken"
    
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri
    }
    
    response = requests.post(url, data=payload)
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Failed to exchange code for token: {response.text}")


def get_linkedin_profile(access_token: str) -> dict:
    """
    Gets the authenticated user's LinkedIn profile
    
    Args:
        access_token: LinkedIn access token
    
    Returns:
        dict with profile information including person URN
    """
    url = "https://api.linkedin.com/v2/me"
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        return {
            "id": data.get("id"),
            "person_urn": f"urn:li:person:{data.get('id')}",
            "first_name": data.get("localizedFirstName"),
            "last_name": data.get("localizedLastName")
        }
    else:
        raise Exception(f"Failed to get profile: {response.text}")


# Mock/Demo function for testing without OAuth
def mock_linkedin_share(text: str) -> dict:
    """
    Mock function for testing LinkedIn integration without OAuth
    
    Args:
        text: Post content
    
    Returns:
        dict with mock success response
    """
    logger.info("MOCK: LinkedIn share (OAuth not configured)")
    logger.info(f"MOCK: Would share: {text[:100]}...")
    
    return {
        "success": True,
        "message": "DEMO MODE: Post content logged. For real sharing, create a LinkedIn App at https://www.linkedin.com/developers/apps and configure your Access Token in .env",
        "provider": "LinkedIn (Demo)",
        "post_id": "demo_post_id_12345",
        "note": "Requires w_member_social permission and OAuth token."
    }
