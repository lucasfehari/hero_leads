#!/usr/bin/env python3
"""
transcribe.py — Transcrição local com faster-whisper (sem API, sem custo)
Uso: python3 transcribe.py <audio_path> [model_size]
Modelos: tiny, base, small, medium, large-v3 (default: small)
Saída: JSON com { text, words, segments }
"""

import sys
import json
import os

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Caminho do áudio não informado"}), flush=True)
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "small"

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"Arquivo não encontrado: {audio_path}"}), flush=True)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "faster-whisper não instalado. Clique em 'Instalar Whisper Local' nas configurações."}), flush=True)
        sys.exit(1)

    # Progress to stderr (Node.js reads and emits to frontend)
    print(f"[WHISPER] Carregando modelo '{model_size}'...", file=sys.stderr, flush=True)

    model = WhisperModel(
        model_size,
        device="cpu",
        compute_type="int8",      # quantized = faster on CPU
        download_root=os.path.expanduser("~/.cache/whisper-local")
    )

    print(f"[WHISPER] Transcrevendo {os.path.basename(audio_path)}...", file=sys.stderr, flush=True)

    segments_gen, info = model.transcribe(
        audio_path,
        word_timestamps=True,
        language="pt",
        vad_filter=True,          # skip silence
        vad_parameters=dict(min_silence_duration_ms=500)
    )

    words = []
    all_segments = []
    full_text = ""

    for i, segment in enumerate(segments_gen):
        seg_text = segment.text.strip()
        full_text += " " + seg_text

        all_segments.append({
            "start": round(segment.start, 3),
            "end":   round(segment.end, 3),
            "text":  seg_text
        })

        if segment.words:
            for w in segment.words:
                words.append({
                    "word":  w.word.strip(),
                    "start": round(w.start, 3),
                    "end":   round(w.end, 3)
                })

        # Progress every 10 segments
        if (i + 1) % 10 == 0:
            print(f"[WHISPER] {i+1} segmentos processados...", file=sys.stderr, flush=True)

    # If no word timestamps, approximate from segments
    if not words and all_segments:
        for seg in all_segments:
            ws = seg["text"].split()
            if not ws:
                continue
            dur = (seg["end"] - seg["start"]) / len(ws)
            for j, w in enumerate(ws):
                words.append({
                    "word":  w,
                    "start": round(seg["start"] + j * dur, 3),
                    "end":   round(seg["start"] + (j + 1) * dur, 3)
                })

    result = {
        "text":     full_text.strip(),
        "words":    words,
        "segments": all_segments,
        "language": info.language,
        "duration": round(info.duration, 1)
    }

    print(json.dumps(result, ensure_ascii=False), flush=True)
    print(f"[WHISPER] Concluído: {len(words)} palavras, idioma detectado: {info.language}", file=sys.stderr, flush=True)

if __name__ == "__main__":
    main()
