import urllib.request
import urllib.error
import json
import time

BASE_URL = "https://seedlingspeaks-backend-0vkj.onrender.com/api"

def make_post_request(endpoint, data):
    """Helper method to make POST request and return status code and body."""
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url, method="POST")
    req.add_header('Content-Type', 'application/json')
    post_data = json.dumps(data).encode('utf-8')
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, data=post_data, timeout=30) as response:
            latency = (time.time() - start_time) * 1000
            content_type = response.getheader('Content-Type', '')
            
            if "audio/" in content_type:
                print(f"\n[⏱️ {latency:.0f}ms] {endpoint} -> [AUDIO_FILE]")
                return response.status, "AUDIO_FILE"
            
            body = response.read().decode('utf-8')
            resp_json = json.loads(body)
            
            # Truncate long base64 strings if present for cleaner printing
            if "segments" in resp_json and isinstance(resp_json["segments"], list):
                for seg in resp_json["segments"]:
                    if "audio" in seg:
                        seg["audio"] = "[BASE64_AUDIO_TRUNCATED]"
            
            print(f"\n[⏱️ {latency:.0f}ms] {endpoint} -> {json.dumps(resp_json, ensure_ascii=False)[:200]}")
            return response.status, resp_json
            
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 500, str(e)


def test_translate_text():
    status, body = make_post_request("/translate-text", {
        "text": "Hello, I am testing the Render backend.",
        "source_language": "en-IN",
        "target_language": "hi-IN"
    })
    assert status == 200
    assert "translated_text" in body

def test_rewrite_tone():
    status, body = make_post_request("/rewrite-tone", {
        "text": "Hey man, give me the report ASAP.",
        "tone": "Email Formal"
    })
    assert status == 200
    assert "rewritten_text" in body

def test_advanced_translate():
    status, body = make_post_request("/advanced-translate", {
        "text": "Let's touch base regarding the deployment pipeline tomorrow.",
        "target_language": "hi-IN"
    })
    assert status == 200

def test_multi_translate():
    status, body = make_post_request("/multi-translate", {
        "text": "Welcome to our application.",
        "languages": ["hi-IN", "ta-IN", "te-IN"]
    })
    assert status == 200

def test_back_translate():
    status, body = make_post_request("/back-translate", {
        "text": "यह एक बहुत अच्छा प्रोजेक्ट है।",
        "source_lang": "hi-IN"
    })
    assert status == 200

def test_synthesize_conversation():
    status, body = make_post_request("/synthesize-conversation", {
        "segments": [
            {"speaker": "Person 1", "translated_text": "नमस्ते, आप कैसे हैं?", "emotion": "happy", "voice": {"gtts_gender": "female"}},
            {"speaker": "Person 2", "translated_text": "मैं ठीक हूँ, धन्यवाद।", "emotion": "neutral", "voice": {"gtts_gender": "male"}}
        ],
        "target_language": "hi-IN"
    })
    assert status == 200
    assert "segments" in body

def test_text_to_speech():
    status, body = make_post_request("/text-to-speech", {
        "text": "नमस्ते",
        "language": "hi-IN",
        "use_sarvam": False,
        "speaker": "female"
    })
    assert status == 200
    assert body == "AUDIO_FILE"
