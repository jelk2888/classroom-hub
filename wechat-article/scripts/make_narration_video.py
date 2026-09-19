# -*- coding: utf-8 -*-
"""从文章旁白 + 截图生成讲解视频（EdgeTTS + ffmpeg）"""
from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(r"D:\天门中学\classroom-hub\wechat-article")
IMG = ROOT / "images"
OUT = ROOT / "video"
OUT.mkdir(parents=True, exist_ok=True)

# 分段旁白（口语化，对应截图）
SEGMENTS = [
    {
        "file": "01-intro.mp3",
        "image": "jpk-home.png",
        "text": "别再把官方平台当文件夹翻了。我给老师做了两套真能上手的网页：一套是精品课解读导航，一套是课堂工具站。申报还是走官方平台，本地页负责找得快、讲得清、课上少切屏。",
    },
    {
        "file": "02-jpk-home.mp3",
        "image": "jpk-home.png",
        "text": "先看第一扇门。精品课解读首页左边三条线：目录主题、活动指南、常见问题。右边六条通道，对应学科、实验、特教，以及人工智能、阅读、科技主题。点进去就走，不用猜文件名。",
    },
    {
        "file": "03-catalog.mp3",
        "image": "jpk-catalog.png",
        "text": "选课目录页不再死磕大表格。上面搜索，左边筛选，中间卡片流。年级学科几下就能缩范围。实验和特教目录，操作习惯同一套。",
    },
    {
        "file": "04-ai.mp3",
        "image": "jpk-ai.png",
        "text": "主题内容页，比如人工智能教育类，是左侧目录加右侧阅读区。边对照官方说明边备课，长文也不迷路。材料标了二零二六，但申报节点仍以平台当下开放为准。",
    },
    {
        "file": "05-hub.mp3",
        "image": "hub-home.png",
        "text": "第二扇门是课堂工具站 classroom hub。计时、随机点名这些碎工具，收进同一扇门，配色也是秋波蓝。主屏继续放课件，副屏固定工具站，少切屏、少丢节奏。",
    },
    {
        "file": "06-panel.mp3",
        "image": "hub-panel.png",
        "text": "侧栏切换面板就行，不用记三套软件界面。两套网页拷文件夹就能给同事用。边界说清楚：不替代官方登录申报。东郭工作室，继续改。",
    },
]


async def synth_all() -> None:
    voice = "zh-CN-XiaoxiaoNeural"
    for seg in SEGMENTS:
        mp3 = OUT / seg["file"]
        if mp3.exists() and mp3.stat().st_size > 1000:
            print("skip tts", seg["file"])
            continue
        last_err: Exception | None = None
        for attempt in range(1, 6):
            try:
                print("tts", seg["file"], f"try {attempt}")
                communicate = edge_tts.Communicate(seg["text"], voice, rate="-5%")
                await communicate.save(str(mp3))
                if mp3.exists() and mp3.stat().st_size > 1000:
                    break
            except Exception as e:  # noqa: BLE001
                last_err = e
                print("tts err", e)
                await asyncio.sleep(2)
        else:
            raise RuntimeError(f"TTS failed for {seg['file']}: {last_err}")


def ffprobe_duration(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(json.loads(r.stdout)["format"]["duration"])


def build_video() -> Path:
    list_file = OUT / "concat.txt"
    clips = []
    for i, seg in enumerate(SEGMENTS):
        img = IMG / seg["image"]
        audio = OUT / seg["file"]
        clip = OUT / f"clip_{i:02d}.mp4"
        dur = ffprobe_duration(audio)
        # 稍长一点，避免尾音被切
        dur = max(dur + 0.35, 2.0)
        cmd = [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-i",
            str(img),
            "-i",
            str(audio),
            "-c:v",
            "libx264",
            "-tune",
            "stillimage",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#eef5f9",
            "-t",
            f"{dur:.3f}",
            "-shortest",
            str(clip),
        ]
        print("encode", clip.name)
        subprocess.run(cmd, check=True, capture_output=True)
        clips.append(clip)

    list_file.write_text(
        "\n".join(f"file '{c.resolve().as_posix()}'" for c in clips),
        encoding="utf-8",
    )
    final = OUT / "讲解视频-两套网页够用.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(final),
        ],
        check=True,
        capture_output=True,
    )
    print("done", final, final.stat().st_size)
    return final


def main() -> None:
    asyncio.run(synth_all())
    build_video()


if __name__ == "__main__":
    main()
