# Intelligence Layer — Mekiki

## Messy Inputs
- Raw CoinGecko tick: price, volume, market cap, % change
- CryptoPanic news feed: headline, URL, source, timestamp
- No consistent signal format across sources

## Auto-Structure Schema (per signal)
```json
{
  "token_id": "uuid",
  "signal_type": "volume_spike | price_move | news_event",
  "severity": "low | medium | high",
  "score": 82,
  "evidence": {
    "volume_ratio": 3.4,
    "price_change_pct": 14.2,
    "matched_keywords": ["airdrop", "listing"]
  },
  "summary": "SOL volume is 3.4× its 7-day average following a major exchange listing announcement.",
  "summary_source": "openai/gpt-4o",
  "summary_confidence": 0.91,
  "summary_review_status": "unreviewed"
}
```

## Scoring Rules (rule-based, v1)
| Condition | Points |
|---|---|
| Volume > 2× 7-day avg | +30 |
| Volume > 4× 7-day avg | +20 bonus |
| Price change > 10% | +20 |
| Price change > 25% | +15 bonus |
| News keyword match (hack/airdrop/listing/partnership) | +15 |
| Multiple signal types on same token | +10 |

Score capped at 100. Top 10 tokens by score → Digest.

## AI Role (v1)
- GPT-4o generates one-sentence `summary` per signal using evidence JSON as context
- Runs server-side in the ingestion Edge Function — never client-side
- Confidence = model's self-reported logprob proxy; stored for display

## v1 vs Later
- **v1**: Rule-based scoring + GPT summary
- **Next**: NLP entity extraction from news (exchange name, event type)
- **Later**: ML-based anomaly detection on rolling baselines; sentiment scoring