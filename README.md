# 답답해서 직접 만든다

둘이 같이 채우는 여행 일정 서비스. 첫 사용처는 2026-12-02 ~ 12-06 하노이·사파 여행.
`https://trip.minu-dev.win` · 홈 화면 이름 "우❤️리오 여행"

- 일정 타임라인 + **갈림길(플랜 A/B/C)**: 당일 아침 날씨 보고 한 명이 고르면 상대 폰에도 바로 반영
- 날씨(Open-Meteo, 사파 시내 + 판시판 정상), 지도(Leaflet + OSM, 트레킹 날은 등고선 지도)
- 장소, 경비·정산, 준비물, 예약, 공유 메모, 긴급 연락처
- PWA: 홈 화면 설치, 오프라인 읽기(마지막으로 받은 일정·예보·지도 타일)

## 구조

```
pb_migrations/   스키마 (PocketBase 시작 시 자동 적용)
pb_hooks/        입장 코드 확인 라우트 (/api/gate/*)
web/src/
  domain/        하루 일정 구성, 정산, 거리 계산 — 순수 TS, 외부 의존 없음
  infra/         PocketBase, Open-Meteo, Nominatim
  app/           상태(스냅샷 + 실시간 반영 + 오프라인 캐시)
  ui/            화면
scripts/         seed-import, setup-vm, deploy, backup, get-pocketbase
qa/              Playwright E2E (iPhone / Android 뷰포트)
```

PocketBase 프로세스 하나가 API·실시간·정적 파일(`pb_public/`)을 같은 포트에서 서빙한다.

### 보안

- 입장은 4자리 코드 + 이름 선택. 코드는 VM의 `.env`(`TRIP_GATE_CODE`)에만 있고 서버에서 비교한다.
- `/api/gate/check`, `/api/gate/enter`는 IP당 1분 5회로 제한(초기 마이그레이션에서 설정).
- `users`는 회원가입·비밀번호 로그인이 꺼져 있다. 모든 컬렉션은 해당 여행 멤버만 읽고 쓸 수 있다(기본 거부).
- `seed.json`(실제 일정·예약)과 `.env`, `pb_data/`는 git에 올리지 않는다.

## 로컬 개발

```bash
npm install
./scripts/get-pocketbase.sh                       # 이 OS/아키텍처용 바이너리
./pocketbase superuser upsert admin@trip.local <비밀번호> --dir=./pb_data   # 먼저! (없으면 설치 페이지가 뜸)
TRIP_GATE_CODE=1234 ./pocketbase serve --http=127.0.0.1:8090 --dir=./pb_data   # 로컬용 아무 4자리
PB_ADMIN_EMAIL=admin@trip.local PB_ADMIN_PASSWORD=<비밀번호> node scripts/seed-import.mjs ~/Downloads/seed.json --geocode
npm run dev                                       # http://localhost:5173 (/api는 8090으로 프록시)
```

테스트:

```bash
npm test                                          # 도메인 단위 테스트
cp -R pb_data /tmp/pb_seeded && qa/run.sh         # 시드된 DB 복사본으로 E2E, 스크린샷은 qa-screens/
```

## 배포 (홈서버, OrbStack VM, pm2)

### 0단계: 기존 homeserver VM 정리 전 확인

homeserver VM 안에서 실행하고 결과를 확인한다. **VM 삭제는 확인 후 직접.**

```bash
ssh minu-dev.win
orb shell -m homeserver
pm2 list
systemctl list-units --type=service --state=running | grep -Ei "cloudflared|kube|containerd|docker"
which cloudflared && ls -la /etc/cloudflared ~/.cloudflared
kubectl get nodes; kubectl get pods -A
crontab -l; ls /opt
```

터널 설정(config.yml, `<터널ID>.json`, cert.pem)이 VM 안에 있으면 먼저 맥으로 옮긴다(맥에서 `orb pull -m homeserver <경로> <맥 경로>`).

### Cloudflare Tunnel: 맥에서 계속 돌리기 (권장)

기존 터널은 맥의 `~/.cloudflared`에 있고 `minu-dev.win` SSH도 같이 처리한다. VM은 언제든 다시 만들 수 있게 두고, 터널은 맥에 그대로 둔다.
맥의 `~/.cloudflared/config.yml`에 추가:

```yaml
ingress:
  - hostname: trip.minu-dev.win
    service: http://<새 VM 이름>.orb.local:8090
  # ... 기존 항목들
  - service: http_status:404
```

```bash
cloudflared tunnel route dns <터널 이름> trip.minu-dev.win   # DNS CNAME 생성
# 터널 재시작 (서비스로 돌고 있으면)
sudo launchctl kickstart -k system/com.cloudflare.cloudflared   # 또는 cloudflared tunnel run <터널 이름>
```

VM에서 돌리고 싶다면: VM에 cloudflared를 설치하고(`sudo apt install cloudflared` 또는 공식 .deb) 같은 설정 파일을 `/etc/cloudflared/`에 두고 `sudo cloudflared service install`. 이때 ingress는 `http://127.0.0.1:8090`, `.env`의 `PB_HTTP=127.0.0.1:8090`.

### 1단계: 새 VM 세팅 (최초 1회)

```bash
ssh minu-dev.win
orb create ubuntu <새 VM 이름>        # arm64
orb shell -m <새 VM 이름>
uname -a                               # Linux 여야 VM 안
curl -fsSL https://raw.githubusercontent.com/LminWoo99/trip-planner/main/scripts/setup-vm.sh | bash
```

`setup-vm.sh`가 하는 일: git·sqlite3·Node LTS·pm2 설치 → `/opt/trip-planner`에 clone → PocketBase(linux arm64) 다운로드 → 빌드 → 입장 코드를 물어 `.env` 생성 → `pm2 start` + 부팅 시 자동 시작 → 매일 04:00 백업 크론 등록.

### 2단계: 첫 데이터 (최초 1회)

```bash
# VM 안
cd /opt/trip-planner
pm2 stop trip-planner
./pocketbase superuser upsert <관리자 이메일> <긴 비밀번호> --dir=./pb_data
pm2 start trip-planner

# 맥에서 seed.json을 VM으로 (OrbStack은 맥 홈을 VM 안 같은 경로로 보여줌)
# VM 안:
PB_ADMIN_EMAIL=<관리자 이메일> PB_ADMIN_PASSWORD=<비밀번호> \
  node scripts/seed-import.mjs /Users/<맥 사용자>/Downloads/seed.json --geocode
```

민우·려진 계정, 여행, 일정 33개, 예약 7개, 장소 5개, 준비물 17개가 생긴다. 같은 여행이 이미 있으면 중복 생성하지 않고 멈춘다.
관리 화면은 `https://trip.minu-dev.win/_/` (관리자 계정으로만).

### 3단계: 업데이트 배포 (코드 수정 후마다)

```bash
ssh minu-dev.win
orb shell -m <새 VM 이름>
cd /opt/trip-planner
./scripts/deploy.sh    # git pull → (lock 변경 시) npm ci → npm run build → pm2 restart → 헬스체크
```

`pb_data/`는 git에 없어서 pull로 덮이지 않는다. 스키마 변경은 `pb_migrations/`에 넣으면 재시작 때 적용된다.

## 백업

- 매일 04:00 `scripts/backup.sh`: `pb_data`를 sqlite 온라인 백업으로 떠서 `/opt/trip-planner-backups/`에 7개 보관, 맥 `/Users/<사용자>/trip-planner-backups/`에도 복사.
- 수동 실행: `/opt/trip-planner/scripts/backup.sh`

### 백업이 실제로 되는지 확인 (여행 전·여행 중 매일)

```bash
# VM 안
tail -3 /opt/trip-planner-backups/backup.log     # "backup ok ... items=N" 이 오늘 날짜로 있는지
ls -lt /opt/trip-planner-backups | head -3
# 맥에서
ls -lt ~/trip-planner-backups | head -3
```

복원 리허설(출국 전에 한 번):

```bash
mkdir -p /tmp/restore && tar -xzf /opt/trip-planner-backups/pb_data-<날짜>.tar.gz -C /tmp/restore
sqlite3 /tmp/restore/pb_data/data.db "select count(*) from items; select title from trips;"
./pocketbase serve --dir=/tmp/restore/pb_data --http=127.0.0.1:8099   # 열어서 확인 후 Ctrl+C
```

실제 복원: `pm2 stop trip-planner` → `pb_data`를 백업본으로 교체 → `pm2 start trip-planner`.

## 폰에서 확인할 것

- iOS Safari / Android Chrome에서 홈 화면에 추가 → 아이콘 이름 "우❤️리오 여행"
- 두 폰에서 동시에 열고 갈림길 선택 → 상대 화면 반영
- 비행기 모드에서 앱 열기 → 일정·메모 읽기, 상단 "오프라인, 마지막 동기화 …"
