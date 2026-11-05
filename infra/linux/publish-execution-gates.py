#!/usr/bin/env python3
"""Mirror root latch metadata only; never creates a grant or changes a stop."""
import sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps-mt5-service'))
from execution_gates import publish_stop_mirror,MIRROR
if __name__=='__main__':
 while True:
  publish_stop_mirror(MIRROR.parent,[Path('/etc/ea-cloud/acceptance')/n for n in ['XAUUSD.STOP','XAUUSD.CLEANUP_STOP']]);time.sleep(1)
