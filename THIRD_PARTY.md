The public Douyin mobile feed endpoints and request User-Agent were identified
from [ucmao/media-parser](https://github.com/ucmao/media-parser),
`src/parsers/douyin_parser.py` (MIT license, Copyright (c) 2025-2026 ucmao).
The focused JavaScript adapter is independently implemented here and retains
certificate validation and the existing request limits.

Public Xiaohongshu note-state field names were also checked against
`src/parsers/xiaohongshu_parser.py` in the same repository. The JavaScript state
reader is implemented locally and never executes page scripts.
