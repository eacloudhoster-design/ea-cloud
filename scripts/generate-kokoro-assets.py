"""Offline only: pip install kokoro-onnx==0.4.9 soundfile. No service/API key."""
import argparse, hashlib, json, os, re, wave
from pathlib import Path
os.environ.setdefault('OMP_NUM_THREADS', '2')
from kokoro_onnx import Kokoro
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--voices', required=True)
parser.add_argument('--phrases', help='Optional JSON array of approved public mentor greetings/labels')
args = parser.parse_args()
if hashlib.sha256(Path(args.model).read_bytes()).hexdigest() != '6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb':
    raise ValueError('Unexpected model. Use the documented Kokoro v1.0 int8 release.')
voice_bytes = np.load(args.voices)['af_heart'].astype('<f4').tobytes()
if hashlib.sha256(voice_bytes).hexdigest() != 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b':
    raise ValueError('Unexpected af_heart voice identity.')
root = Path(__file__).resolve().parents[1]
profile = {'id': hashlib.sha256(b'kokoro-82m-v1.0:af_heart:speed1:24k:peak0.85:v1').hexdigest(), 'model':'Kokoro-82M-v1.0', 'voice':'af_heart', 'configured': True}
phrases = json.loads((root/'lib/api-zod/src/common-voice-phrases.json').read_text())
if args.phrases:
    extra = json.loads(Path(args.phrases).read_text())
    if not isinstance(extra,list) or not all(isinstance(x,str) and 0<len(x)<=300 for x in extra):
        raise ValueError('Expected a JSON array of short public phrases. Do not include financial/private facts.')
    phrases += extra
folder = root/'artifacts/ea-app/public/natural-voice'
(folder/profile['id']).mkdir(parents=True, exist_ok=True)
manifest = {'version':1,'profile':profile,'clips':{}}
engine = Kokoro(args.model,args.voices)
for text in dict.fromkeys(phrases):
    digest = hashlib.sha256(text.encode()).hexdigest()
    name = f"{profile['id']}/{digest}.wav"
    target = folder/name
    valid = False
    if target.exists():
        try:
            with wave.open(str(target)) as f:
                valid = f.getframerate()==24000 and f.getnchannels()==1 and f.getsampwidth()==2 and f.getnframes()>0
        except wave.Error: pass
    if not valid:
        audio,rate = engine.create(text,voice='af_heart',speed=1.0,lang='en-us')
        if rate!=24000 or not len(audio) or not np.isfinite(audio).all(): raise ValueError('Invalid generated audio')
        peak=float(np.max(np.abs(audio)))
        if peak<0.001: raise ValueError('Silent generated audio')
        pcm=(np.clip(audio*(0.85/peak),-1,1)*32767).astype('<i2')
        with wave.open(str(target),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm.tobytes())
    manifest['clips'][digest]=name
    (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'event':'kokoro_clip_saved','text':text,'file':name}),flush=True)
