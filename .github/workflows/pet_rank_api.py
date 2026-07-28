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
    "Accept": "application/json, text/plain, */*",
}

session = requests.Session()
session.headers.update(HEADERS)


# ---------------- 저장 ----------------
def save_data(data):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), SAVE_FILE)
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        with open(tmp, "r", encoding="utf-8") as f:
            json.load(f)          # 검증
        os.replace(tmp, path)
        print(f"저장 완료 -> {path}")
    except Exception as e:
        print(f"저장 실패: {e}")
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


# ---------------- 펫 목록 ----------------
def fetch_pet_list():
    r = session.get(LIST_URL, timeout=TIMEOUT)
    r.raise_for_status()
    text = r.content.decode("cp949", errors="replace")   # 이 파일은 EUC-KR/CP949

    pets, seen = [], set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.count(",") < 10:
            continue
        cols = next(csv.reader(io.StringIO(line)))
        if len(cols) <= ID_COL:
            continue
        name = cols[NAME_COL].strip()
        raw_id = cols[ID_COL].strip()
        if not name or not raw_id.isdigit():
            continue
        pid = int(raw_id)
        if pid in seen:
            continue
        seen.add(pid)
        pets.append({"name": name, "id": pid})
    return pets


# ---------------- 랭킹 ----------------
def fmt(v, d=3):
    """사이트 표시 형식과 동일하게: toFixed(d) 후 뒤쪽 0 제거"""
    if v is None or v == "":
        return "-"
    try:
        s = f"{float(v):.{d}f}"
    except (TypeError, ValueError):
        return str(v)
    return re.sub(r"\.?0+$", "", s) if "." in s else s


def fetch_rank(pid, reincarnate):
    params = {"enemybase_id": pid, "reincarnate": 1 if reincarnate else 0}
    last = None
    for attempt in range(RETRY):
        try:
            r = session.get(RANK_URL, params=params, timeout=TIMEOUT)
            r.raise_for_status()
            data = r.json()
            if not data.get("ok"):
                return []
            rows = data.get("rows") or []
            out = []
            for i, row in enumerate(rows[:5], 1):
                def cell(stat_key, growth_key):
                    base = row.get(stat_key)
                    return f"{base if base is not None else '-'} ({fmt(row.get(growth_key), 2)})"

                out.append({
                    # ↓ 기존 pet_ranking.html 이 쓰던 키 그대로 (표시 형식까지 동일)
                    "rank": i,
                    "nickname": row.get("owner_name"),
                    "level": row.get("level"),
                    "exp": cell("stats_hp", "growth_hp"),        # 실제 의미는 내구력
                    "attack": cell("stats_atk", "growth_atk"),
                    "defense": cell("stats_def", "growth_def"),
                    "speed": cell("stats_spd", "growth_spd"),
                    "score": fmt(row.get("growth_total"), 3),
                    # ↓ 나중에 쓰기 좋은 순수 숫자 필드 (기존 코드엔 영향 없음)
                    "hp_num": row.get("stats_hp"),
                    "atk_num": row.get("stats_atk"),
                    "def_num": row.get("stats_def"),
                    "spd_num": row.get("stats_spd"),
                    "total_num": row.get("stats_total"),
                    "score_num": row.get("growth_total"),
                    "updated": row.get("updated_time"),
                })
            return out
        except Exception as e:
            last = e
            time.sleep(0.6 * (attempt + 1))
    print(f"  ! id={pid} reinc={int(reincarnate)} 실패: {last}")
    return []


def collect_one(pet):
    general = fetch_rank(pet["id"], False)
    rebirth = fetch_rank(pet["id"], True)
    return {
        "name": pet["name"],
        "enemybase_id": pet["id"],
        "general_ranking": general,
        "rebirth_ranking": rebirth,
    }


def collect_all():
    print("펫 목록 로딩...")
    pets = fetch_pet_list()
    print(f"발견된 펫: {len(pets)}마리\n")

    results = [None] * len(pets)
    done = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(collect_one, p): i for i, p in enumerate(pets)}
        for fut in as_completed(futures):
            idx = futures[fut]
            res = fut.result()
            results[idx] = res
            done += 1
            print(f"[{done:3d}/{len(pets)}] {res['name']:16s} "
                  f"일반{len(res['general_ranking'])} / 환생{len(res['rebirth_ranking'])}",
                  flush=True)

    now = datetime.now()
    print(f"\n소요 {time.time()-t0:.1f}초")
    return {
        "timestamp": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "total_pets": len(results),
        "pets": results,
    }


def main():
    print("=" * 60)
    print("펫 랭킹 수집 (API 직접 호출판)")
    print("=" * 60)
    n = 0
    while True:
        n += 1
        if n > 1:
            nxt = datetime.combine(date.today() + timedelta(days=1), dtime(0, 0, 0))
            wait = (nxt - datetime.now()).total_seconds()
            print(f"\n다음 수집: {nxt:%Y-%m-%d %H:%M:%S} (대기 {int(wait//3600)}시간)")
            time.sleep(max(wait, 60))

        print(f"\n수집 #{n} - {datetime.now():%Y-%m-%d %H:%M:%S}\n")
        data = collect_all()
        save_data([data])
        if not LOOP:
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n종료")
        sys.exit(0)
