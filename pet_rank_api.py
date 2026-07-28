# -*- coding: utf-8 -*-
"""
윈드 페트 랭킹 수집 (셀레니움 X / 로그인 X / 공식 API 직접 호출)
- 펫 목록:  https://wind01.net/pet_enemy_data.php   (CSV, cp949)
- 랭킹 API: https://wind01.net/info/api/pet_rank.php?enemybase_id=<id>&reincarnate=0|1
"""

import csv
import io
import re
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date, time as dtime, timedelta

import requests

BASE = "https://wind01.net"
LIST_URL = BASE + "/pet_enemy_data.php"
RANK_URL = BASE + "/info/api/pet_rank.php"
SAVE_FILE = "pet_ranking_data.json"

WORKERS = 10         # 동시 요청 수 (서버 응답이 느려서 이 정도가 적당)
RETRY = 3
TIMEOUT = 15
LOOP = False         # True 로 두면 매일 자정마다 자동 재수집

NAME_COL = 0         # CSV 0번째 = 펫 이름
ID_COL = 7           # CSV 7번째 = enemybase_id

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Referer": BASE + "/tools/pet.php",
