// 전역 변수
let map;
let markers = [];
let allBearData = [];
let filteredData = [];
let currentLanguage = 'ko';
let currentMonth = null;
let currentHour = null;
let currentWeekday = null;
let currentLocation = null;
let currentSightingType = null;

// 구글 시트 설정
const SHEET_ID = '1YlsTXib1LEbk_DkQlhIGwstQ4DenSRWeyTBpJsRR-IQ';
const SHEET_NAME = '불곰출몰정보';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

// 목격 유형별 이모지 매핑
const SIGHTING_TYPE_EMOJI = {
    '곰 목격': '🐻',
    '곰 흔적 확인': '👣',
    '곰 사살': '🔴',
    '곰 가족 목격': '🐻🐻',
    '곰 추정 목격': '⚫',
    '곰에 의한 사상': '🤕',
    'default': '🐻'
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
        console.log('구글 시트에서 데이터 로딩 중...');
        
        const response = await fetch(SHEET_URL);
        const text = await response.text();
        const jsonData = JSON.parse(text.substring(47).slice(0, -2));
        
        const rows = jsonData.table.rows;
        const bearData = [];
        
        const weekdayMap = {
            '月': '월', '火': '화', '水': '수', '木': '목',
            '金': '금', '土': '토', '日': '일'
        };
        
        // 5번 행(인덱스 4)부터 데이터 시작
        // 4번 행(인덱스 3)은 헤더
        for (let i = 4; i < rows.length; i++) {
            const row = rows[i];
            if (!row.c) continue;
            
            const cells = row.c;
            
            // A열 공란, B열부터 데이터
            const id = cells[1]?.v;              // B열: 연번
            const year = cells[2]?.v || 2025;    // C열: 연도
            const month = cells[3]?.v;           // D열: 월
            const day = cells[4]?.v;             // E열: 일
            const weekdayJa = cells[5]?.v;       // F열: 요일
            const time = cells[6]?.v;            // G열: 시간
            const location = cells[9]?.v;        // J열: 하위 행정
            const address = cells[10]?.v;        // K열: 세부 주소
            const description = cells[11]?.v;    // L열: 내용
            const sightingTypeRaw = cells[12]?.v; // M열: 목격 정보
            const lat = cells[14]?.v;            // O열: Latitude
            const lng = cells[15]?.v;            // P열: Longitude
            
            if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                const weekday = weekdayMap[weekdayJa] || weekdayJa;
                const sightingType = normalizeSightingType(sightingTypeRaw);
                
                bearData.push({
                    id: id,
                    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                    month: month,
                    weekday: weekday,
                    time: time,
                    location: location,
                    address: address,
                    description: description,
                    sightingType: sightingType,
                    lat: parseFloat(lat),
                    lng: parseFloat(lng)
                });
            }
        }
        
        allBearData = bearData;
        filteredData = [...allBearData];
        
        console.log(`✓ ${allBearData.length}건의 곰 출몰 데이터 로드 완료`);
        
        updateMarkers();
        updateDynamicStats();
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

// 적용 중인 조건 표시 업데이트
function updateActiveFilters() {
    const filterTags = [];
    
    if (currentLocation) {
        filterTags.push(currentLocation);
    }
    
    if (currentMonth !== null) {
        filterTags.push(`${currentMonth}월`);
    }
    
    if (currentWeekday !== null) {
        filterTags.push(`${currentWeekday}요일`);
    }
    
    if (currentHour !== null) {
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
    } else {
        const hour = value - 1;
        currentHour = hour;
        updateTimeLabel(`${hour}시~${hour+1}시`, `${hour}時~${hour+1}時`, `${hour}:00-${hour+1}:00`);
    }
    
    applyFilters();
}

// 시간 레이블 업데이트
function updateTimeLabel(ko, ja, en) {
    const timeValueKo = document.querySelector('#timeValue [data-lang="ko"]');
    
    if (timeValueKo) {
        timeValueKo.textContent = ko;
        const timeValueJa = document.querySelector('#timeValue [data-lang="ja"]');
        const timeValueEn = document.querySelector('#timeValue [data-lang="en"]');
        if (timeValueJa) timeValueJa.textContent = ja;
        if (timeValueEn) timeValueEn.textContent = en;
    } else {
        document.getElementById('timeValue').innerHTML = `
            <span data-lang="ko">${ko}</span>
            <span data-lang="ja" style="display:none;">${ja}</span>
            <span data-lang="en" style="display:none;">${en}</span>
        `;
    }
    
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

        if (currentMonth !== null && bear.month !== currentMonth) {
            matches = false;
        }

        if (currentHour !== null && bear.time) {
            const bearHour = extractHour(bear.time);
            if (bearHour !== currentHour) {
                matches = false;
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
    updateDynamicStats();
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
    document.getElementById('totalCount').textContent = allBearData.length;
    
    const selectedAreaElem = document.getElementById('selectedArea');
    if (currentLocation) {
        selectedAreaElem.textContent = currentLocation;
    } else {
        if (currentLanguage === 'ko') {
            selectedAreaElem.textContent = '전체';
        } else if (currentLanguage === 'ja') {
            selectedAreaElem.textContent = '全て';
        } else {
            selectedAreaElem.textContent = 'All';
        }
    }
}

// 동적 통계 업데이트
function updateDynamicStats() {
    const stats = calculateStats(filteredData.length > 0 ? filteredData : allBearData);
    
    document.getElementById('maxLocation').textContent = `${stats.maxLocation.name} (${stats.maxLocation.count}건)`;
    document.getElementById('maxMonth').textContent = `${stats.maxMonth.name}월 (${stats.maxMonth.count}건)`;
    document.getElementById('maxWeekday').textContent = `${stats.maxWeekday.name}요일 (${stats.maxWeekday.count}건)`;
    document.getElementById('maxTime').textContent = `${stats.maxTime.name}시~${stats.maxTime.name + 1}시 (${stats.maxTime.count}건)`;
    
    updateStats();
}

// 통계 계산
function calculateStats(data) {
    const locationCounts = {};
    data.forEach(bear => {
        if (bear.location) {
            locationCounts[bear.location] = (locationCounts[bear.location] || 0) + 1;
        }
    });
    const maxLocation = Object.keys(locationCounts).length > 0 
        ? Object.entries(locationCounts).reduce((a, b) => a[1] > b[1] ? a : b)
        : ['N/A', 0];
    
    const monthCounts = {};
    data.forEach(bear => {
        if (bear.month) {
            monthCounts[bear.month] = (monthCounts[bear.month] || 0) + 1;
        }
    });
    const maxMonth = Object.keys(monthCounts).length > 0
        ? Object.entries(monthCounts).reduce((a, b) => a[1] > b[1] ? a : b)
        : [0, 0];
    
    const weekdayCounts = {};
    data.forEach(bear => {
        if (bear.weekday) {
            weekdayCounts[bear.weekday] = (weekdayCounts[bear.weekday] || 0) + 1;
        }
    });
    const maxWeekday = Object.keys(weekdayCounts).length > 0
        ? Object.entries(weekdayCounts).reduce((a, b) => a[1] > b[1] ? a : b)
        : ['N/A', 0];
    
    const hourCounts = {};
    data.forEach(bear => {
        if (bear.time) {
            const hour = extractHour(bear.time);
            if (hour !== null) {
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            }
        }
    });
    const maxTime = Object.keys(hourCounts).length > 0
        ? Object.entries(hourCounts).reduce((a, b) => a[1] > b[1] ? a : b).map(v => parseInt(v))
        : [0, 0];
    
    return {
        maxLocation: { name: maxLocation[0], count: maxLocation[1] },
        maxMonth: { name: maxMonth[0], count: maxMonth[1] },
        maxWeekday: { name: maxWeekday[0], count: maxWeekday[1] },
        maxTime: { name: maxTime[0], count: maxTime[1] }
    };
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
            allMonths: '전체 월',
            allTime: '전체 시간',
            allWeekdays: '전체 요일',
            allTypes: '전체 유형'
        },
        ja: {
            allLocations: '全ての地域',
            allMonths: '全ての月',
            allTime: '全ての時間',
            allWeekdays: '全ての曜日',
            allTypes: '全てのタイプ'
        },
        en: {
            allLocations: 'All Areas',
            allMonths: 'All Months',
            allTime: 'All Hours',
            allWeekdays: 'All Days',
            allTypes: 'All Types'
        }
    };

    locationFilter.options[0].text = labels[lang].allLocations;
    sightingTypeFilter.options[0].text = labels[lang].allTypes;
    
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
