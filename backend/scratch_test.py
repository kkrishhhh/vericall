import os
import sys
import io
import json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from dotenv import load_dotenv
from agent import run_agent

load_dotenv()

history = []
transcript = "मेरा नाम अमित है।"
try:
    resp = run_agent(transcript, history, "hi")
    print(json.dumps(resp, ensure_ascii=False))
except Exception as e:
    import traceback
    traceback.print_exc()
