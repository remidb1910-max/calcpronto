"""Send the pages added by the last push to the IndexNow engines (Bing, Yandex, Seznam, Naver).

The key is the 32-character file name served at the root of the site (site/<key>.txt). The first time the key
is published, every page of the sitemap is sent once; afterwards only the pages that were not in the sitemap of
the previous commit.
"""

import glob
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

HOST = "calcpronto.com"


def locs(text: str) -> list[str]:
    return re.findall(r"<loc>(.*?)</loc>", text)


def previous(path: str) -> str:
    """Content of a file in the previous commit ("" when it did not exist)."""
    done = subprocess.run(["git", "show", f"HEAD~1:{path}"], capture_output=True, text=True)
    return done.stdout if done.returncode == 0 else ""


keys = [os.path.basename(p)[:-4] for p in glob.glob("site/*.txt") if re.fullmatch(r"[0-9a-f]{32}\.txt", os.path.basename(p))]
if not keys:
    sys.exit("No IndexNow key file in site/: nothing sent.")
key = keys[0]
current = locs(open("site/sitemap.xml", encoding="utf-8").read())
before = set(locs(previous("site/sitemap.xml")))
first_time = not previous(f"site/{key}.txt")
urls = current if (first_time or not before) else [u for u in current if u not in before]
print(f"{len(current)} pages in the sitemap, {len(before)} in the previous commit, {len(urls)} to send")
if not urls:
    sys.exit(0)
def live(url: str) -> bool:
    try:
        return urllib.request.urlopen(url, timeout=20).status == 200
    except Exception:
        return False


# Wait until the CDN serves the key file and the newest page (up to about 8 minutes).
for _ in range(16):
    if live(f"https://{HOST}/{key}.txt") and live(urls[-1]):
        break
    time.sleep(30)

for i in range(0, len(urls), 10000):
    body = json.dumps({"host": HOST, "key": key, "keyLocation": f"https://{HOST}/{key}.txt",
                       "urlList": urls[i:i + 10000]}).encode("utf-8")
    for attempt in range(3):  # 403 = the engine could not read the key file yet: wait and try again
        request = urllib.request.Request("https://api.indexnow.org/indexnow", data=body,
                                         headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            print("IndexNow:", urllib.request.urlopen(request, timeout=60).status)
            break
        except Exception as exc:  # never fail for this
            print("IndexNow error:", exc)
            time.sleep(120)
