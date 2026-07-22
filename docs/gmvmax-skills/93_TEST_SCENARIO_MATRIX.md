# Cross-Skill Test Scenario Matrix

| Scenario | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---|---|---|---|---|---|---|---|---|---|
| Healthy stable day | Ready | High confidence | No major alert | No material cause | Hold | Hold | Healthy supply | Healthy if data | Observe/maintain |
| GMV down from spend decline | Ready | Complete | Performance event | Likely spend driver | Hold/review | Review allocation | Observe | Optional | Prioritize investigation |
| ROI down from CVR decline | Ready | Complete | Efficiency event | Likely conversion driver | Do not lower TROI blindly | No increase | Review product/creative | Optional | Recommend conversion investigation |
| GMV up, efficiency down | Ready | Complete | Mixed event | Capital-led growth | Observe | Review increase | Check supply | Optional | Warn about efficiency |
| Creative shortage | Ready | Complete | Supply event | Likely bottleneck | Avoid Max Delivery | Avoid increase | Add supply | Optional | Recommend creative action |
| Product concentration | Ready | Complete | Concentration event | Contributing factor | Hold | Reduce concentration | Add product coverage | Optional | Recommend diversification |
| Spend without orders | Ready | Complete | Product event | Insufficient/likely conversion issue | Do not lower TROI automatically | No increase | Review creative/product | Optional | Investigate |
| Pagination incomplete | Partial | Blocked/low | Data-quality event | Insufficient evidence | Do not change | No allocation | Partial | Partial | Do not execute |
| Missing feature settings | Partial | Complete | Partial | Partial | Blocked | Partial | Partial | Partial | Observe |
| Late attribution | Ready | High risk | Provisional event | Downgraded | Observe | Delay | Observe | Observe | Wait |
| Low sample | Ready | Low | Low-confidence event | Insufficient evidence | Hold | Testing only | Continue test | Observe | Observe |
| Conflicting signals | Ready | Medium | Multiple events | Alternatives shown | Hold | Hold | Observe | Observe | Explicit conflict |
| Legacy advertiser | Ready | Transition-aware | No false alert | Historical/current split | No effect forward | No effect forward | No effect | No effect | Explain limitation |
| Workspace isolation failure | Blocked | Critical | Critical | Blocked | Blocked | Blocked | Blocked | Blocked | Do not execute |
| Missing LIVE data | Ready | Complete | Non-LIVE unaffected | Non-LIVE unaffected | Unaffected | Unaffected | Unaffected | Blocked | No LIVE action |
| Sustainable creative winner | Ready | Complete | Positive supply event | Supporting factor | Optional | Optional | Protect winner | Optional | Recommend protect |
| Temporary creative spike | Ready | Complete | Volatility event | Inferred | Hold | Hold | Continue observation | Optional | Observe |
| Canonical mismatch | Partial | Blocked | Data-quality event | Insufficient | Blocked | Blocked | Partial | Partial | Do not execute |
| Budget cap reached | Ready | Complete | Delivery event | Likely constraint | Review | Review capital | Check supply | Optional | Approval required |
| Automatic execution attempted | Critical | Critical | Critical | Critical | Blocked | Blocked | Blocked | Blocked | Do not execute |

---

## Global required tests

1. Workspace isolation
2. Idempotent rerun
3. Stable deterministic signature
4. No raw token
5. No raw MCP payload
6. No TikTok mutation reference
7. No canonical write
8. `execution_allowed=false`
9. Indonesian labels
10. English labels
11. Expiry present
12. Rule IDs present
13. Source snapshot IDs present
14. Missing values remain null/unknown
15. Historical outputs retain original rule version
