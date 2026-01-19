// 전역 변수
let map;
let markers = [];
let allBearData = [];
let filteredData = [];
let currentLanguage = 'ko';
let currentYear = null;
let currentMonth = null;
let currentHour = null;
let currentWeekday = null;
let currentLocation = null;
let currentSightingType = null;

// 구글 시트 설정
const SHEET_ID = '1YlsTXib1LEbk_DkQlhIGwstQ4DenSRWeyTBpJsRR-IQ';
const SHEET_NAME = '불곰출몰정보';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

// 목격 유형별 이모지 및 번역 매핑
const SIGHTING_TYPE_EMOJI = {
    '곰 목격': '🐻',
    '곰 흔적 확인': '👣',
    '곰 사살': '🔴',
    '곰 가족 목격': '🐻🐻',
    '곰 추정 목격': '⚫',
    '곰에 의한 사상': '🤕',
    'default': '🐻'
};

const SIGHTING_TYPE_TRANSLATIONS = {
    '곰 목격': { ko: '곰 목격', ja: 'クマ目撃', en: 'Bear Sighting' },
    '곰 흔적 확인': { ko: '곰 흔적 확인', ja: 'クマ痕跡確認', en: 'Bear Tracks Found' },
    '곰 사살': { ko: '곰 사살', ja: 'クマ駆除', en: 'Bear Captured' },
    '곰 가족 목격': { ko: '곰 가족 목격', ja: 'クマ親子目撃', en: 'Bear Family Sighting' },
    '곰 추정 목격': { ko: '곰 추정 목격', ja: 'クマ可能性', en: 'Possible Bear Sighting' },
    '곰에 의한 사상': { ko: '곰에 의한 사상', ja: 'クマによる人身事故', en: 'Bear Attack' }
};

// 목격 유형 정규화
function normalizeSightingType(type) {
    if (!type) return '곰 목격';
    const typeStr = type.toString().trim();
    
    if (typeStr.includes('가족') || typeStr.includes('親子')) return '곰 가족 목격';
    if (typeStr.includes('사살') || typeStr.includes('駆除') || typeStr.includes('捕獲')) return '곰 사살';
    if (typeStr.includes('흔적') || typeStr.includes('痕跡') || typeStr.includes('糞') || typeStr.includes('足跡')) return '곰 흔적 확인';
    if (typeStr.includes('사상') || typeStr.includes('人身') || typeStr.includes('負傷')) return '곰에 의한 사상';
    if (typeStr.includes('추정') || typeStr.includes('可能性') || typeStr.includes('疑い')) return '곰 추정 목격';
    
    return '곰 목격';
}

// 지도 초기화
function initMap() {
    map = L.map('map').setView([43.0642, 141.3469], 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    loadBearDataFromGoogleSheets();
}

// 구글 시트에서 곰 데이터 로드
async function loadBearDataFromGoogleSheets() {
    try {
        const response = await fetch(SHEET_URL);
        const text = await response.text();
        const jsonData = JSON.parse(text.substring(47).slice(0, -2));
        
        const rows = jsonData.table.rows;
        const bearData = [];
        
        const weekdayMap = {
            '月': '월', '火': '화', '水': '수', '木': '목',
            '金': '금', '土': '토', '日': '일'
        };
        
        // 첫 행이 헤더인지 데이터인지 확인
        let startIndex = 0;
        if (rows[0] && rows[0].c) {
            const firstCell = rows[0].c[0]?.v;
            if (firstCell && (typeof firstCell === 'string' || firstCell === '연번')) {
                startIndex = 1;
            }
        }
        
        console.log('데이터 시작 인덱스:', startIndex);
        
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            
            if (!row.c) continue;
            
            const cells = row.c;
            
            const getCellByIndex = (idx) => {
                return cells[idx]?.v ?? null;
            };
            
            const id = getCellByIndex(0);
            const year = getCellByIndex(1) || 2025;
            const month = getCellByIndex(2);
            const day = getCellByIndex(3);
            const weekdayJa = getCellByIndex(4);
            const time = getCellByIndex(5);
            const location = getCellByIndex(8);
            const address = getCellByIndex(9);
            const description = getCellByIndex(10);
            const sightingTypeRaw = getCellByIndex(11);
            const lat = getCellByIndex(13);
            const lng = getCellByIndex(14);
            
            if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
                const weekday = weekdayMap[weekdayJa] || weekdayJa;
                const sightingType = normalizeSightingType(sightingTypeRaw);
                
                bearData.push({
                    id: id,
                    year: year,
                    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                    month: month,
                    day: day,
                    weekday: weekday,
                    time: time,
                    location: location,
                    address: address,
                    description: description,
                    sightingType: sightingType,
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
                    timestamp: new Date(year, month - 1, day).getTime()
                });
            }
        }
        
        allBearData = bearData;
        filteredData = [...allBearData];
        
        console.log(`✓ ${allBearData.length}건의 곰 출몰 데이터 로드 완료`);
        
        updateMarkers();
        updateRecentUpdates();
        updateActiveFilters();
        
    } catch (error) {
        console.error('구글 시트 데이터 로드 실패:', error);
        alert('데이터를 불러올 수 없습니다. 구글 시트가 공개 설정되어 있는지 확인해주세요.');
    }
}

// 마커 업데이트
function updateMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    filteredData.forEach(bear => {
        const marker = createBearMarker(bear);
        markers.push(marker);
        marker.addTo(map);
    });

    updateStats();
}

// 곰 마커 생성
function createBearMarker(bear) {
    const emoji = SIGHTING_TYPE_EMOJI[bear.sightingType] || SIGHTING_TYPE_EMOJI['default'];
    
    const icon = L.divIcon({
        html: `<div style="
            background: #ff6b35;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            border: 2px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            cursor: pointer;
        ">${emoji}</div>`,
        iconSize: [32, 32],
        className: ''
    });

    const marker = L.marker([bear.lat, bear.lng], { icon });

    const popupContent = `
        <div class="popup-content">
            <div class="popup-date">${bear.date} ${bear.time || ''}</div>
            <div class="popup-location">${bear.location}</div>
            <div class="popup-address">${bear.address}</div>
            <div style="margin-top: 4px; padding: 2px 6px; background: #f8f9fa; border-radius: 4px; font-size: 11px;">
                ${emoji} ${bear.sightingType}
            </div>
            <div class="popup-desc">${bear.description}</div>
        </div>
    `;

    marker.bindPopup(popupContent);
    return marker;
}

// 최근 3일 업데이트 정보 표시
function updateRecentUpdates() {
    const now = Date.now();
    const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
    
    const recentData = allBearData
        .filter(bear => bear.timestamp >= threeDaysAgo)
        .sort((a, b) => b.timestamp - a.timestamp);
    
    const recentList = document.getElementById('recentList');
    
    if (recentData.length === 0) {
        recentList.innerHTML = `
            <li class="no-recent">
                <span data-lang="ko">최근 3일간 업데이트가 없습니다</span>
                <span data-lang="ja" style="display:none;">最近3日間の更新はありません</span>
                <span data-lang="en" style="display:none;">No updates in the last 3 days</span>
            </li>
        `;
    } else {
        recentList.innerHTML = recentData.map(bear => {
            const emoji = SIGHTING_TYPE_EMOJI[bear.sightingType] || SIGHTING_TYPE_EMOJI['default'];
            const sightingTypeText = SIGHTING_TYPE_TRANSLATIONS[bear.sightingType];
            
            return `
                <li class="recent-item">
                    <div class="recent-emoji">${emoji}</div>
                    <div class="recent-content">
                        <div class="recent-date">${bear.date} ${bear.time || ''}</div>
                        <div class="recent-location">${bear.location}</div>
                        <div class="recent-type">
                            <span data-lang="ko">${sightingTypeText.ko}</span>
                            <span data-lang="ja" style="display:none;">${sightingTypeText.ja}</span>
                            <span data-lang="en" style="display:none;">${sightingTypeText.en}</span>
                        </div>
                    </div>
                </li>
            `;
        }).join('');
    }
    
    // 언어 설정 다시 적용
    document.querySelectorAll('[data-lang]').forEach(elem => {
        elem.style.display = 'none';
    });
    document.querySelectorAll(`[data-lang="${currentLanguage}"]`).forEach(elem => {
        elem.style.display = '';
    });
}

// 적용 중인 조건 표시 업데이트
function updateActiveFilters() {
    const filterTags = [];
    
    if (currentLocation) {
        filterTags.push(currentLocation);
    }
    
    if (currentYear !== null) {
        filterTags.push(`${currentYear}년`);
    }
    
    if (currentMonth !== null) {
        filterTags.push(`${currentMonth}월`);
    }
    
    if (currentWeekday !== null) {
        filterTags.push(`${currentWeekday}요일`);
    }
    
    if (currentHour === -1) {
        filterTags.push('시간 불명');
    } else if (currentHour !== null) {
        filterTags.push(`${currentHour}시~${currentHour+1}시`);
    }
    
    if (currentSightingType) {
        const emoji = SIGHTING_TYPE_EMOJI[currentSightingType] || '';
        filterTags.push(`${emoji} ${currentSightingType}`);
    }
    
    const filterTagsElem = document.getElementById('filterTags');
    
    if (filterTags.length === 0) {
        filterTagsElem.innerHTML = `
            <span class="filter-tag all">
                <span data-lang="ko">전체</span>
                <span data-lang="ja" style="display:none;">全て</span>
                <span data-lang="en" style="display:none;">All</span>
            </span>
        `;
    } else {
        filterTagsElem.innerHTML = filterTags.map(tag => 
            `<span class="filter-tag">${tag}</span>`
        ).join('');
    }
    
    document.querySelectorAll('[data-lang]').forEach(elem => {
        elem.style.display = 'none';
    });
    document.querySelectorAll(`[data-lang="${currentLanguage}"]`).forEach(elem => {
        elem.style.display = '';
    });
}

// 연도 슬라이더 업데이트
function updateYearFilter() {
    const slider = document.getElementById('yearSlider');
    const value = parseInt(slider.value);
    
    if (value === 0) {
        currentYear = null;
        updateYearLabel('전체 연도', '全ての年度', 'All Years');
    } else {
        const year = 2018 + value; // 0=전체, 1=2019, 2=2020, ..., 8=2026
        currentYear = year;
        updateYearLabel(`${year}년`, `${year}年`, `${year}`);
    }
    
    applyFilters();
}

// 연도 레이블 업데이트
function updateYearLabel(ko, ja, en) {
    document.getElementById('yearValue').innerHTML = `
        <span data-lang="ko">${ko}</span>
        <span data-lang="ja" style="display:none;">${ja}</span>
        <span data-lang="en" style="display:none;">${en}</span>
    `;
    
    document.querySelectorAll('#yearValue [data-lang]').forEach(elem => {
        elem.style.display = 'none';
    });
    document.querySelectorAll(`#yearValue [data-lang="${currentLanguage}"]`).forEach(elem => {
        elem.style.display = '';
    });
}

// 월 슬라이더 업데이트
function updateMonthFilter() {
    const slider = document.getElementById('monthSlider');
    const value = parseInt(slider.value);
    
    if (value === 0) {
        currentMonth = null;
        updateMonthLabel('전체 월', '全ての月', 'All Months');
    } else {
        currentMonth = value;
        updateMonthLabel(`${value}월`, `${value}月`, getMonthName(value));
    }
    
    applyFilters();
}

// 요일 슬라이더 업데이트
function updateWeekdayFilter() {
    const slider = document.getElementById('weekdaySlider');
    const value = parseInt(slider.value);
    
    if (value === 0) {
        currentWeekday = null;
        updateWeekdayLabel('전체 요일', '全ての曜日', 'All Days');
    } else {
        const weekdays = ['', '월', '화', '수', '목', '금', '토', '일'];
        currentWeekday = weekdays[value];
        updateWeekdayLabel(`${currentWeekday}요일`, getWeekdayNameJa(value), getWeekdayNameEn(value));
    }
    
    applyFilters();
}

// 시간 슬라이더 업데이트
function updateTimeFilter() {
    const slider = document.getElementById('timeSlider');
    const value = parseInt(slider.value);
    
    if (value === 0) {
        currentHour = null;
        updateTimeLabel('전체 시간', '全ての時間', 'All Hours');
    } else if (value === 1) {
        currentHour = -1; // 시간 불명
        updateTimeLabel('시간 불명', '時間不明', 'Time Unknown');
    } else {
        const hour = value - 2; // value 2 = 0시, 3 = 1시, ..., 25 = 23시
        currentHour = hour;
        updateTimeLabel(`${hour}시~${hour+1}시`, `${hour}時~${hour+1}時`, `${hour}:00-${hour+1}:00`);
    }
    
    applyFilters();
}

// 시간 레이블 업데이트
function updateTimeLabel(ko, ja, en) {
    document.getElementById('timeValue').innerHTML = `
        <span data-lang="ko">${ko}</span>
        <span data-lang="ja" style="display:none;">${ja}</span>
        <span data-lang="en" style="display:none;">${en}</span>
    `;
    
    document.querySelectorAll('#timeValue [data-lang]').forEach(elem => {
        elem.style.display = 'none';
    });
    document.querySelectorAll(`#timeValue [data-lang="${currentLanguage}"]`).forEach(elem => {
        elem.style.display = '';
    });
}

// 월 이름 라벨 업데이트
function updateMonthLabel(ko, ja, en) {
    const monthValueKo = document.getElementById('monthValue');
    const monthValueJa = document.getElementById('monthValue-ja');
    const monthValueEn = document.getElementById('monthValue-en');
    
    if (monthValueKo) monthValueKo.textContent = ko;
    if (monthValueJa) monthValueJa.textContent = ja;
    if (monthValueEn) monthValueEn.textContent = en;
}

// 요일 레이블 업데이트
function updateWeekdayLabel(ko, ja, en) {
    const weekdayValueKo = document.getElementById('weekdayValue');
    const weekdayValueJa = document.getElementById('weekdayValue-ja');
    const weekdayValueEn = document.getElementById('weekdayValue-en');
    
    if (weekdayValueKo) weekdayValueKo.textContent = ko;
    if (weekdayValueJa) weekdayValueJa.textContent = ja;
    if (weekdayValueEn) weekdayValueEn.textContent = en;
}

// 영어 월 이름
function getMonthName(month) {
    const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month] || `Month ${month}`;
}

// 일본어 요일 이름
function getWeekdayNameJa(index) {
    const weekdays = ['', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];
    return weekdays[index] || '';
}

// 영어 요일 이름
function getWeekdayNameEn(index) {
    const weekdays = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return weekdays[index] || '';
}

// 필터 적용
function applyFilters() {
    const locationFilter = document.getElementById('locationFilter').value;
    const sightingTypeFilter = document.getElementById('sightingTypeFilter').value;
    
    currentLocation = locationFilter;
    currentSightingType = sightingTypeFilter;

    filteredData = allBearData.filter(bear => {
        let matches = true;

        if (currentYear !== null && bear.year !== currentYear) {
            matches = false;
        }

        if (currentMonth !== null && bear.month !== currentMonth) {
            matches = false;
        }

        if (currentHour === -1) {
            // 시간 불명: time 필드에 '時間不明'이 포함된 경우
            const timeStr = bear.time ? bear.time.toString().trim() : '';
            if (!timeStr.includes('時間不明') && !timeStr.includes('시간 불명') && !timeStr.includes('不明')) {
                matches = false;
            }
        } else if (currentHour !== null) {
            // 특정 시간대 필터
            const timeStr = bear.time ? bear.time.toString().trim() : '';
            // 時間不明이 포함되어 있으면 제외
            if (timeStr.includes('時間不明') || timeStr.includes('시간 불명') || timeStr.includes('不明')) {
                matches = false;
            } else {
                const bearHour = extractHour(bear.time);
                if (bearHour === null || bearHour !== currentHour) {
                    matches = false;
                }
            }
        }

        if (currentWeekday !== null && bear.weekday !== currentWeekday) {
            matches = false;
        }

        if (locationFilter && bear.location !== locationFilter) {
            matches = false;
        }
        
        if (sightingTypeFilter && bear.sightingType !== sightingTypeFilter) {
            matches = false;
        }

        return matches;
    });

    updateMarkers();
    updateActiveFilters();
}

// 시간 문자열에서 시간 추출
function extractHour(timeString) {
    if (!timeString) return null;
    const match = timeString.toString().match(/^(\d+):/);
    return match ? parseInt(match[1]) : null;
}

// 통계 업데이트
function updateStats() {
    document.getElementById('visibleCount').textContent = filteredData.length;
    
    const selectedAreaElem = document.getElementById('selectedArea');
    if (currentLocation) {
        selectedAreaElem.innerHTML = currentLocation;
    } else {
        selectedAreaElem.innerHTML = `
            <span data-lang="ko">전체</span>
            <span data-lang="ja" style="display:none;">全て</span>
            <span data-lang="en" style="display:none;">All</span>
        `;
        
        // 언어 설정 적용
        selectedAreaElem.querySelectorAll('[data-lang]').forEach(elem => {
            elem.style.display = 'none';
        });
        selectedAreaElem.querySelectorAll(`[data-lang="${currentLanguage}"]`).forEach(elem => {
            elem.style.display = '';
        });
    }
}

// 언어 변경
function setLanguage(lang) {
    currentLanguage = lang;

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    document.querySelectorAll('[data-lang]').forEach(elem => {
        elem.style.display = 'none';
    });

    document.querySelectorAll(`[data-lang="${lang}"]`).forEach(elem => {
        elem.style.display = '';
    });

    updateFilterLabels(lang);
    updateActiveFilters();
}

// 필터 레이블 업데이트
function updateFilterLabels(lang) {
    const locationFilter = document.getElementById('locationFilter');
    const sightingTypeFilter = document.getElementById('sightingTypeFilter');

    const labels = {
        ko: {
            allLocations: '전체 지역',
            allYears: '전체 연도',
            allMonths: '전체 월',
            allTime: '전체 시간',
            allWeekdays: '전체 요일',
            allTypes: '전체 유형'
        },
        ja: {
            allLocations: '全ての地域',
            allYears: '全ての年度',
            allMonths: '全ての月',
            allTime: '全ての時間',
            allWeekdays: '全ての曜日',
            allTypes: '全てのタイプ'
        },
        en: {
            allLocations: 'All Areas',
            allYears: 'All Years',
            allMonths: 'All Months',
            allTime: 'All Hours',
            allWeekdays: 'All Days',
            allTypes: 'All Types'
        }
    };

    const sightingTypeLabels = {
        ko: ['전체 유형', '🐻 곰 목격', '👣 곰 흔적 확인', '🔴 곰 사살', '🐻🐻 곰 가족 목격', '⚫ 곰 추정 목격', '🤕 곰에 의한 사상'],
        ja: ['全てのタイプ', '🐻 クマ目撃', '👣 クマ痕跡確認', '🔴 クマ駆除', '🐻🐻 クマ親子目撃', '⚫ クマ可能性', '🤕 クマによる人身事故'],
        en: ['All Types', '🐻 Bear Sighting', '👣 Bear Tracks Found', '🔴 Bear Captured', '🐻🐻 Bear Family Sighting', '⚫ Possible Bear Sighting', '🤕 Bear Attack']
    };

    locationFilter.options[0].text = labels[lang].allLocations;
    
    // 목격 정보 필터 옵션 업데이트
    for (let i = 0; i < sightingTypeFilter.options.length; i++) {
        sightingTypeFilter.options[i].text = sightingTypeLabels[lang][i];
    }
    
    if (currentYear === null) {
        updateYearLabel(labels[lang].allYears, labels['ja'].allYears, labels['en'].allYears);
    }
    
    if (currentMonth === null) {
        updateMonthLabel(labels[lang].allMonths, labels['ja'].allMonths, labels['en'].allMonths);
    }
    
    if (currentWeekday === null) {
        updateWeekdayLabel(labels[lang].allWeekdays, labels['ja'].allWeekdays, labels['en'].allWeekdays);
    }
    
    if (currentHour === null) {
        updateTimeLabel(labels[lang].allTime, labels['ja'].allTime, labels['en'].allTime);
    }
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
    initMap();
});
