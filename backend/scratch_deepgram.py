import os
import requests
from dotenv import load_dotenv
load_dotenv()

api_key = os.getenv("DEEPGRAM_API_KEY")

for lang in ["hi", "mr", "en-IN"]:
    url = f"https://api.deepgram.com/v1/listen?model=nova-2&language={lang}"
    headers = {"Authorization": f"Token {api_key}"}
    resp = requests.post(url, headers=headers, data=b"fake_audio")
    print(f"Lang: {lang}, Status: {resp.status_code}, Resp: {resp.text[:200]}")
