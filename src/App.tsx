import React, { useState, useEffect } from 'react';
import * as dateFns from 'date-fns';
import { Calendar, List, Download, ChevronLeft, ChevronRight, ShieldCheck, AlertCircle, Info, Trash2, X, User, Zap, Network, Clock, AlignLeft, MapPin, Building2, Cloud } from 'lucide-react';

// 사용자 제공 Firebase Config
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, deleteField } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC5UNH2HekL5r0SwyHrja_3pkbKJTHU3Mo",
  authDomain: "hss-system-233c6.firebaseapp.com",
  projectId: "hss-system-233c6",
  storageBucket: "hss-system-233c6.firebasestorage.app",
  messagingSenderId: "689641624104",
  appId: "1:689641624104:web:041738c4f8b11532255b1d"
};

const technicians = [
  { id: 1, team: '수도권', center: '계양센터', name: '구세림' },
  { id: 2, team: '수도권', center: '계양센터', name: '이기훈' },
  { id: 3, team: '수도권', center: '나라센터', name: '최인섭' },
  { id: 4, team: '수도권', center: '부평센터', name: '공영상' },
  { id: 5, team: '수도권', center: '부평센터', name: '노승윤' },
  { id: 6, team: '수도권', center: '부평센터', name: '문병주' },
  { id: 7, team: '수도권', center: '양천센터', name: '박재홍' },
  { id: 8, team: '동부', center: '강릉센터', name: '박성복' },
  { id: 9, team: '동부', center: '동해센터', name: '이정엽' },
  { id: 10, team: '동부', center: '속초센터', name: '홍태욱' },
  { id: 11, team: '남부', center: '경주센터', name: '최은석' },
  { id: 12, team: '남부', center: '대구센터', name: '황장철' },
  { id: 13, team: '남부', center: '양산센터', name: '이성진' },
  { id: 14, team: '남부', center: '양산센터', name: '이원진' },
];

const workTypes = [
  { id: 'ev', name: '전기차충전기', color: 'bg-blue-100 text-blue-900 border-blue-400 hover:ring-blue-500' },
  { id: 'cctv', name: 'CCTV', color: 'bg-emerald-100 text-emerald-900 border-emerald-400 hover:ring-emerald-500' },
  { id: 'maint', name: '정보통신유지보수', color: 'bg-amber-100 text-amber-900 border-amber-400 hover:ring-amber-500' },
  { id: 'libero', name: '리베로', color: 'bg-purple-100 text-purple-900 border-purple-400 hover:ring-purple-500' },
];

// 10분 단위 슬롯 생성 (9:00 ~ 18:50) -> 19:00 마감
const generateTimeSlots = () => {
    const slots = [];
    for (let h = 9; h <= 18; h++) {
        for (let m = 0; m < 60; m += 10) {
            slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        }
    }
    return slots;
};
const VALID_SLOTS = generateTimeSlots();

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('daily');
  const [schedules, setSchedules] = useState({}); 
  
  const [cloudStatus, setCloudStatus] = useState('connecting');
  const [cloudErrorDetail, setCloudErrorDetail] = useState(''); // 에러 상세 내용 상태 추가
  const [dbInstance, setDbInstance] = useState(null);

  const [alertConfig, setAlertConfig] = useState({ isOpen: false, message: '' });
  const [deleteConfig, setDeleteConfig] = useState({ isOpen: false, dateKey: null, techId: null, existingSchedule: null, password: '' });
  const [addModalConfig, setAddModalConfig] = useState({ isOpen: false, techId: null, slotKey: null, dateKey: null });
  const [overtimeConfig, setOvertimeConfig] = useState({ isOpen: false, updates: null, dateKey: null });
  
  // 폼 초기값 (0시간 0분)
  const [addFormWorkType, setAddFormWorkType] = useState('ev');
  const [addFormHours, setAddFormHours] = useState(0); 
  const [addFormMinutes, setAddFormMinutes] = useState(0); 
  const [addFormRegion, setAddFormRegion] = useState('');
  const [addFormBuilding, setAddFormBuilding] = useState('');
  const [addFormMemo, setAddFormMemo] = useState('');

  const [userName, setUserName] = useState('');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [tempName, setTempName] = useState('');
  const [currentUserIp, setCurrentUserIp] = useState(null);

  const showAlert = (message) => setAlertConfig({ isOpen: true, message });

  useEffect(() => {
    document.title = "HSS시스템 (클라우드 연동)";

    const initUser = async () => {
        try {
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            setCurrentUserIp(data.ip);
            const storedName = localStorage.getItem(`hc_smss_name_${data.ip}`);
            if (storedName) setUserName(storedName);
            else setNameModalOpen(true);
        } catch (e) {
            const fallbackName = localStorage.getItem('hc_smss_username');
            if (fallbackName) setUserName(fallbackName);
            else setNameModalOpen(true);
        }
    };
    initUser();

    // Firebase 초기화 및 연결
    let unsubAuth = null;
    let unsubSnapshot = null;

    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        setDbInstance(db);
        
        // 익명 로그인 (Firebase 인증 필수)
        signInAnonymously(auth).catch((error) => {
            console.error("Firebase Auth Error:", error);
            setCloudStatus('error');
            setCloudErrorDetail(`인증 차단됨: ${error.message}`);
        });

        unsubAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                // 앱 전용 경로에 데이터 저장 (보안 및 구조화 목적)
                const schedulesRef = collection(db, 'artifacts', 'hss-system', 'public', 'data', 'schedules');
                
                unsubSnapshot = onSnapshot(schedulesRef, (snapshot) => {
                    const newData = {};
                    snapshot.forEach(doc => {
                        newData[doc.id] = doc.data();
                    });
                    setSchedules(newData);
                    setCloudStatus('connected');
                    setCloudErrorDetail('');
                }, (error) => {
                    console.error("Firestore Error:", error);
                    setCloudStatus('error');
                    setCloudErrorDetail(`DB 접근 차단됨: ${error.code} (규칙을 확인하세요)`);
                });
            } else {
                setCloudStatus('connecting');
            }
        });
    } catch(err) {
        console.error("Firebase initialization failed", err);
        setCloudStatus('error');
        setCloudErrorDetail(`초기화 실패: ${err.message}`);
    }

    return () => {
        if (unsubAuth) unsubAuth();
        if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  const handleCellClick = (techId, slotKey, dateKey) => {
    const existingSchedule = schedules[dateKey]?.[`${techId}_${slotKey}`];
    
    if (existingSchedule) {
      setDeleteConfig({ isOpen: true, dateKey, techId, existingSchedule, password: '' });
    } else {
      setAddModalConfig({ isOpen: true, techId, slotKey, dateKey });
      setAddFormWorkType('ev');
      setAddFormHours(0);
      setAddFormMinutes(0);
      setAddFormRegion('');
      setAddFormBuilding('');
      setAddFormMemo('');
    }
  };

  const handlePreSubmitAddSchedule = () => {
    const { techId, slotKey, dateKey } = addModalConfig;
    const workType = workTypes.find(wt => wt.id === addFormWorkType);
    
    const totalMinutes = (addFormHours * 60) + addFormMinutes;
    if (totalMinutes === 0) {
        showAlert("소요 시간을 10분 이상 설정해 주세요.");
        return;
    }

    const blocksNeeded = Math.ceil(totalMinutes / 10);
    const startIndex = VALID_SLOTS.indexOf(slotKey);
    const currentDaySchedule = schedules[dateKey] || {};

    let slotsToFill = [];
    let currentIndex = startIndex;
    let blocksCount = 0;

    // 점심시간(12:00~12:50) 건너뛰기 로직 적용
    while (blocksCount < blocksNeeded && currentIndex < VALID_SLOTS.length) {
        const currentSlot = VALID_SLOTS[currentIndex];
        // 12시대 슬롯은 배열에 넣지 않고 인덱스만 넘김
        if (currentSlot.startsWith("12:")) {
            currentIndex++;
            continue;
        }
        slotsToFill.push(currentSlot);
        blocksCount++;
        currentIndex++;
    }
    
    if (slotsToFill.length < blocksNeeded) {
         showAlert("선택한 작업 시간이 업무 종료 시간(19:00)을 초과하여 등록할 수 없습니다.");
         return;
    }

    const hasOverlap = slotsToFill.some(s => currentDaySchedule[`${techId}_${s}`]);
    if (hasOverlap) {
        showAlert("선택한 시간대에 이미 다른 일정이 있어 충돌합니다.");
        return;
    }

    let displayTime = '';
    if (addFormHours > 0) displayTime += `${addFormHours}시간 `;
    if (addFormMinutes > 0) displayTime += `${addFormMinutes}분`;
    displayTime = displayTime.trim();

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const updates = {};

    slotsToFill.forEach((s, index) => {
        updates[`${techId}_${s}`] = {
            workTypeId: workType.id,
            title: workType.name,
            region: addFormRegion.trim(),
            building: addFormBuilding.trim(),
            memo: addFormMemo.trim(),
            displayTime: displayTime,
            author: userName || '익명',
            taskId: taskId,
            isStart: index === 0, // 첫 블록만 헤더 표시
            duration: blocksNeeded
        };
    });

    // 18시 이후 슬롯 포함 시 연장근무 경고
    const hasOvertime = slotsToFill.some(s => s >= "18:00");
    if (hasOvertime) {
        setOvertimeConfig({ isOpen: true, updates, dateKey });
    } else {
        executeAddSchedule(updates, dateKey);
    }
  };

  const executeAddSchedule = async (updates, targetDateKey) => {
    if (!dbInstance) return;
    try {
        const docRef = doc(dbInstance, 'artifacts', 'hss-system', 'public', 'data', 'schedules', targetDateKey);
        await setDoc(docRef, updates, { merge: true });
        
        setAddModalConfig({ isOpen: false, techId: null, slotKey: null, dateKey: null });
        setOvertimeConfig({ isOpen: false, updates: null, dateKey: null });
    } catch (err) {
        console.error("Save error:", err);
        showAlert("클라우드 저장 중 오류가 발생했습니다.");
    }
  };

  const submitDeleteSchedule = async () => {
    if (deleteConfig.password !== '1470') {
      showAlert("관리자 코드가 일치하지 않습니다.");
      return;
    }
    if (!dbInstance) return;

    const { dateKey, techId, existingSchedule } = deleteConfig;
    const currentDaySchedule = schedules[dateKey] || {};
    const taskIdToDelete = existingSchedule.taskId;
    const updates = {};

    Object.keys(currentDaySchedule).forEach(key => {
        if (key.startsWith(`${techId}_`) && currentDaySchedule[key].taskId === taskIdToDelete) {
            updates[key] = deleteField();
        }
    });

    try {
        const docRef = doc(dbInstance, 'artifacts', 'hss-system', 'public', 'data', 'schedules', dateKey);
        await updateDoc(docRef, updates);
        setDeleteConfig({ isOpen: false, dateKey: null, techId: null, existingSchedule: null, password: '' });
    } catch (err) {
        console.error("Delete error:", err);
        showAlert("일정 삭제 중 오류가 발생했습니다.");
    }
  };

  const downloadCSV = () => {
    // 이전과 동일한 로직 유지
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    // ... 생략 없이 전체 코드 작성 ...
    if (viewMode === 'daily') {
        const dateKey = dateFns.format(selectedDate, 'yyyy-MM-dd');
        csvContent += `일자:,${dateKey}\n\n`;
        csvContent += "순번,팀,센터,성명," + VALID_SLOTS.join(',') + "\n";
        
        technicians.forEach((tech, index) => {
            let row = `${index + 1},${tech.team},${tech.center},${tech.name}`;
            const processedTasks = new Set();
            VALID_SLOTS.forEach(slot => {
                const sch = schedules[dateKey]?.[`${tech.id}_${slot}`];
                if (sch) {
                    if (!processedTasks.has(sch.taskId)) {
                        processedTasks.add(sch.taskId);
                        const regionInfo = sch.region ? `[${sch.region}] ` : '';
                        const bldgInfo = sch.building ? `[${sch.building}] ` : '';
                        row += `,"${sch.title} ${regionInfo}${bldgInfo}(${sch.displayTime}) - ${sch.memo} (${sch.author})"`;
                    } else {
                        row += `,"${sch.title}"`;
                    }
                } else {
                    row += ",";
                }
            });
            csvContent += row + "\n";
        });
    } else {
        const monthStart = dateFns.startOfMonth(currentDate);
        const monthEnd = dateFns.endOfMonth(currentDate);
        const daysInMonth = dateFns.eachDayOfInterval({ start: monthStart, end: monthEnd });
        
        csvContent += `월:,${dateFns.format(currentDate, 'yyyy년 MM월')}\n\n`;
        csvContent += "날짜,팀,센터,성명,작업유형,지역,건물,시간,메모,등록자\n";

        daysInMonth.forEach(day => {
            const dateKey = dateFns.format(day, 'yyyy-MM-dd');
            const daySchedule = schedules[dateKey];
            if (daySchedule) {
                const processedTasks = new Set();
                Object.keys(daySchedule).forEach(key => {
                    const [techIdStr] = key.split('_');
                    const techId = parseInt(techIdStr);
                    const task = daySchedule[key];
                    
                    if (!processedTasks.has(task.taskId)) {
                        processedTasks.add(task.taskId);
                        const tech = technicians.find(t => t.id === techId);
                        const workTypeName = workTypes.find(w => w.id === task.workTypeId)?.name || '알수없음';
                        csvContent += `${dateKey},${tech.team},${tech.center},${tech.name},${workTypeName},"${task.region || ''}","${task.building || ''}","${task.displayTime}","${task.memo || ''}",${task.author}\n`;
                    }
                });
            }
        });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `일정_${dateFns.format(viewMode === 'daily' ? selectedDate : currentDate, 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderMonthlyView = () => {
    const monthStart = dateFns.startOfMonth(currentDate);
    const monthEnd = dateFns.endOfMonth(currentDate);
    const startDate = dateFns.startOfWeek(monthStart);
    const endDate = dateFns.endOfWeek(monthEnd);

    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    const rows = [];
    let days = [];
    let day = startDate;

    const header = (
        <div className="grid grid-cols-7 mb-2 border-b-2 border-slate-300 pb-3">
            {weekDays.map((wd, i) => (
                <div key={i} className={`text-center font-bold text-lg ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-700'}`}>
                    {wd}
                </div>
            ))}
        </div>
    );

    while (day <= endDate) {
        for (let i = 0; i < 7; i++) {
            const formattedDate = dateFns.format(day, "d");
            const cloneDay = day;
            const dateKey = dateFns.format(cloneDay, 'yyyy-MM-dd');
            const daySchedule = schedules[dateKey];
            
            let taskCount = 0;
            if (daySchedule) {
                const uniqueTasks = new Set();
                Object.values(daySchedule).forEach(task => uniqueTasks.add(task.taskId));
                taskCount = uniqueTasks.size;
            }

            const isCurrentMonth = dateFns.isSameMonth(day, monthStart);
            const isToday = dateFns.isSameDay(day, new Date());

            days.push(
                <div
                    key={day}
                    onClick={() => { setSelectedDate(cloneDay); setViewMode('daily'); }}
                    className={`min-h-[140px] p-3 border-r border-b border-slate-200 cursor-pointer transition-all hover:bg-indigo-50/60 
                        ${!isCurrentMonth ? "bg-slate-50 opacity-50" : "bg-white"}
                    `}
                >
                    <div className="flex justify-between items-start">
                         <span className={`text-base font-extrabold flex items-center justify-center w-10 h-10 rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-lg' : i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-800'}`}>
                            {formattedDate}
                        </span>
                    </div>
                    
                    {taskCount > 0 && (
                        <div className="mt-4 flex flex-col gap-2">
                            <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm font-bold px-3 py-2 rounded-xl text-center flex items-center justify-center gap-2 shadow-sm">
                                <Clock size={16} />
                                총 {taskCount}건 등록됨
                            </div>
                        </div>
                    )}
                </div>
            );
            day = dateFns.addDays(day, 1);
        }
        rows.push(<div className="grid grid-cols-7" key={day}>{days}</div>);
        days = [];
    }

    return (
        <div className="bg-white rounded-3xl shadow-md border-2 border-slate-200 p-8 overflow-hidden">
            {header}
            <div className="border-t-2 border-l-2 border-slate-200 rounded-2xl overflow-hidden mt-4">
                {rows}
            </div>
        </div>
    );
  };

  const renderDailyView = () => {
    const dateKey = dateFns.format(selectedDate, 'yyyy-MM-dd');
    const daySchedule = schedules[dateKey] || {};
    const skipCells = new Set(); 

    const getRightBorderStyle = (index) => {
        if (index === technicians.length - 1) return '2px solid #64748b'; // 표 맨 끝 (굵은 실선)
        const current = technicians[index];
        const next = technicians[index + 1];
        if (current.team !== next.team) return '2px solid #64748b'; // 팀간 구별 (굵은 실선)
        if (current.center !== next.center) return '1px solid #94a3b8'; // 센터간 구별 (얇은 실선)
        return '1px dashed #cbd5e1'; // 같은 센터 구성원 (얇은 점선)
    };

    // 헤더 병합 그룹화
    const teamGroups = [];
    const centerGroups = [];
    technicians.forEach((tech, i) => {
        if (teamGroups.length === 0 || teamGroups[teamGroups.length - 1].name !== tech.team) {
            teamGroups.push({ name: tech.team, count: 1 });
        } else {
            teamGroups[teamGroups.length - 1].count++;
        }
        if (centerGroups.length === 0 || centerGroups[centerGroups.length - 1].name !== tech.center) {
            centerGroups.push({ name: tech.center, count: 1, lastTechIndex: i });
        } else {
            centerGroups[centerGroups.length - 1].count++;
            centerGroups[centerGroups.length - 1].lastTechIndex = i;
        }
    });

    return (
        <div className="bg-white rounded-3xl shadow-md border-2 border-slate-200 overflow-hidden flex flex-col h-[75vh]">
            <div className="bg-indigo-50/50 border-b-2 border-slate-200 p-3 flex justify-between items-center shrink-0">
                <span className="font-bold text-slate-600 flex items-center gap-2 text-sm">
                    <Info size={16} className="text-indigo-500" />
                    시간 칸을 클릭하여 일정을 등록하세요. (가로 실선은 1시간 단위, 얇은 점선은 10분 단위입니다.)
                </span>
            </div>

            <div className="overflow-auto flex-1 relative custom-scrollbar">
                <table className="w-full min-w-max border-separate border-spacing-0 table-fixed select-none">
                    <thead className="sticky top-0 z-30 shadow-sm bg-white">
                        <tr>
                            <th rowSpan="3" className="sticky left-0 z-40 bg-slate-200 p-2 text-center text-slate-700 font-extrabold text-sm shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                                style={{ borderRight: '2px solid #64748b', borderBottom: '2px solid #64748b' }}>
                                시간
                            </th>
                            {teamGroups.map((team, idx) => (
                                <th key={`team-${idx}`} colSpan={team.count} className="p-1.5 text-center bg-indigo-50"
                                    style={{ borderRight: '2px solid #64748b', borderBottom: '1px solid #cbd5e1' }}>
                                    <div className="text-xs text-indigo-700 font-black tracking-widest">{team.name}</div>
                                </th>
                            ))}
                        </tr>
                        <tr>
                            {centerGroups.map((center, idx) => {
                                const isTeamBoundary = center.lastTechIndex === technicians.length - 1 || 
                                                       technicians[center.lastTechIndex].team !== technicians[center.lastTechIndex + 1].team;
                                return (
                                    <th key={`center-${idx}`} colSpan={center.count} className="p-1 text-center bg-slate-50"
                                        style={{ borderRight: isTeamBoundary ? '2px solid #64748b' : '1px solid #94a3b8', borderBottom: '1px solid #cbd5e1' }}>
                                        <div className="text-[11px] text-slate-600 font-bold">{center.name}</div>
                                    </th>
                                );
                            })}
                        </tr>
                        <tr>
                            {technicians.map((tech, index) => (
                                <th key={tech.id} className="p-1.5 min-w-[100px] w-[120px] text-center bg-white"
                                    style={{ borderRight: getRightBorderStyle(index), borderBottom: '2px solid #64748b' }}>
                                    <div className="font-extrabold text-slate-900 text-sm">{tech.name}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(() => {
                            const rows = [];
                            let addedLunchIndicator = false;

                            VALID_SLOTS.forEach((slot, slotIndex) => {
                                // 점심시간(12:00~12:50) 처리
                                if (slot.startsWith("12:")) {
                                    if (!addedLunchIndicator) {
                                        rows.push(
                                            <tr key="lunch_break" className="pointer-events-none bg-slate-100" style={{ height: "40px" }}>
                                                <td className="sticky left-0 z-20 bg-slate-300 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                                                    style={{ borderRight: '2px solid #64748b', borderBottom: '2px solid #64748b' }}>
                                                    <span className="font-black tracking-tighter text-slate-600 text-xs">12:00</span>
                                                </td>
                                                <td colSpan={technicians.length} className="text-center bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#e2e8f0_10px,#e2e8f0_20px)] opacity-90"
                                                    style={{ borderBottom: '2px solid #64748b', borderRight: '2px solid #64748b' }}>
                                                    <span className="font-extrabold text-slate-500 text-sm tracking-widest flex items-center justify-center gap-2">
                                                        <Clock size={16} /> 점 심 시 간 (12:00 ~ 13:00)
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                        addedLunchIndicator = true;
                                    }
                                    return; // 12시대는 행을 그리지 않음
                                }

                                const isHourStart = slot.endsWith(":00");
                                const isHourEnd = slot.endsWith("50");
                                const isAfter18 = slot >= "18:00";
                                
                                rows.push(
                                    <tr key={slot} className="transition-colors group" style={{ height: "24px" }}>
                                        {/* 시간 컬럼 */}
                                        <td className={`sticky left-0 z-20 p-0 text-center ${isAfter18 ? 'bg-red-50/30' : 'bg-white'}`}
                                            style={{ 
                                                borderRight: '2px solid #64748b', 
                                                borderBottom: isHourEnd ? '2px solid #64748b' : '1px dashed #cbd5e1' 
                                            }}>
                                            <div className="h-full flex items-center justify-center">
                                                <span className={isHourStart ? "font-bold text-slate-700 text-sm" : "font-medium text-slate-400 text-[10px]"}>{slot}</span>
                                            </div>
                                        </td>
                                        
                                        {/* 작업자 데이터 컬럼 */}
                                        {technicians.map((tech, index) => {
                                            const cellKey = `${tech.id}_${slot}`;
                                            if (skipCells.has(cellKey)) return null;

                                            const schedule = daySchedule[cellKey];
                                            if (schedule) {
                                                let rSpan = 1;
                                                const isMorning = slot < "12:00";
                                                
                                                for (let i = slotIndex + 1; i < VALID_SLOTS.length; i++) {
                                                    const nextSlot = VALID_SLOTS[i];
                                                    // 점심시간 건너뛰고 계산
                                                    if (nextSlot.startsWith("12:")) continue;
                                                    
                                                    const nextTask = daySchedule[`${tech.id}_${nextSlot}`];
                                                    
                                                    if (nextTask && nextTask.taskId === schedule.taskId) {
                                                        // 오전 일정이 오후로 넘어갈 땐 분리해서 렌더링 (rowSpan 끊기)
                                                        if (isMorning && nextSlot >= "13:00") break; 
                                                        rSpan++;
                                                        skipCells.add(`${tech.id}_${nextSlot}`);
                                                    } else {
                                                        break;
                                                    }
                                                }
                                                
                                                const wt = workTypes.find(w => w.id === schedule.workTypeId);
                                                const tooltipText = `[${schedule.title}]\n시간: ${schedule.displayTime}\n지역: ${schedule.region || '미입력'}\n건물: ${schedule.building || '미입력'}\n메모: ${schedule.memo || '없음'}\n등록: ${schedule.author}`;
                                                
                                                return (
                                                    <td 
                                                        key={tech.id} 
                                                        rowSpan={rSpan} 
                                                        title={tooltipText}
                                                        onClick={() => handleCellClick(tech.id, slot, dateKey)}
                                                        className={`p-0 align-top relative cursor-pointer transition-all ${wt?.color || 'bg-slate-200 text-slate-800'} shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] hover:brightness-95 hover:z-10`}
                                                        style={{ 
                                                            borderRight: getRightBorderStyle(index), 
                                                            borderBottom: '2px solid #64748b' // 스케줄 끝은 항상 진한 실선
                                                        }}
                                                    >
                                                        <div className="absolute inset-0 w-full h-full flex flex-col p-1.5 overflow-hidden z-10">
                                                            <div className="font-extrabold text-xs leading-tight truncate flex items-center gap-1">
                                                                {schedule.title}
                                                                {!schedule.isStart && <span className="font-medium text-[9px] opacity-70 bg-black/10 px-1 rounded">(계속)</span>}
                                                            </div>
                                                            
                                                            {rSpan >= 2 && (
                                                                <div className="flex flex-col mt-0.5 gap-0.5 opacity-90 text-[10px] leading-tight w-full">
                                                                    {(schedule.region || schedule.building) && (
                                                                        <div className="font-bold truncate w-full text-black/70">
                                                                            {schedule.region} {schedule.building}
                                                                        </div>
                                                                    )}
                                                                    {schedule.memo && (
                                                                        <div className="font-medium truncate opacity-85 w-full">
                                                                            {schedule.memo}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            
                                                            {rSpan >= 3 && (
                                                                <div className="mt-auto pt-1 text-[10px] font-bold opacity-75 flex items-center gap-0.5 justify-end">
                                                                    <User size={10} />
                                                                    {schedule.author}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            }

                                            return (
                                                <td 
                                                    key={tech.id}
                                                    onClick={() => handleCellClick(tech.id, slot, dateKey)}
                                                    className={`p-0 relative cursor-pointer transition-colors hover:bg-indigo-50/80 ${isAfter18 ? 'bg-red-50/20' : ''}`}
                                                    style={{ 
                                                        borderRight: getRightBorderStyle(index), 
                                                        borderBottom: isHourEnd ? '2px solid #64748b' : '1px dashed #cbd5e1' 
                                                    }}
                                                >
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 z-10">
                                                        <span className="text-indigo-600 font-bold text-xs">+</span>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            });
                            return rows;
                        })()}
                    </tbody>
                </table>
            </div>
            <style jsx="true">{`
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-4 md:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* Header */}
        <header className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 p-6 rounded-3xl shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 20px 20px, white 2%, transparent 0%)', backgroundSize: '40px 40px' }}></div>
          
          <div className="flex flex-col relative z-10 w-full md:w-auto items-center md:items-start text-center md:text-left">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/20 backdrop-blur-md rounded-2xl text-indigo-300 border border-indigo-400/30 shadow-md">
                <Network size={32} />
              </div>
              <div className="flex flex-col">
                  <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">HSS 시스템</h1>
                  <span className="text-indigo-300 text-xs md:text-sm font-bold tracking-widest mt-1">Real-time Cloud Scheduler</span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-center items-center gap-2 text-sm bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700/50 backdrop-blur-sm shadow-inner">
                {cloudStatus === 'connected' ? (
                    <><Cloud size={18} className="text-emerald-400 fill-emerald-400/20" /><span className="text-emerald-300 font-bold">클라우드 실시간 동기화 중</span></>
                ) : cloudStatus === 'connecting' ? (
                    <><Cloud size={18} className="text-amber-400 animate-pulse" /><span className="text-amber-300 font-bold">서버 연결 중...</span></>
                ) : (
                    <><AlertCircle size={18} className="text-red-400" /><span className="text-red-300 font-bold">오프라인 모드 (연결 오류)</span></>
                )}
                <div className="hidden sm:block w-px h-4 bg-slate-600 mx-2"></div>
                <User size={16} className="text-slate-400" />
                <span className="text-slate-200 font-bold text-base">{userName || '로그인 필요'}</span>
            </div>
            
            {/* 에러 발생 시 상세 원인을 붉은색 배지로 화면에 직접 표시합니다 */}
            {cloudStatus === 'error' && cloudErrorDetail && (
                <div className="mt-3 bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-2 rounded-xl text-xs font-bold break-all">
                    🚨 에러 원인: {cloudErrorDetail}
                </div>
            )}
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-5 relative z-10 w-full md:w-auto mt-2 md:mt-0">
            <div className="flex items-center gap-2 text-white font-black text-2xl tracking-wide bg-white/5 px-5 py-2.5 rounded-2xl backdrop-blur-sm border border-white/10 shadow-lg">
              <Zap size={26} className="text-amber-400 fill-amber-400/20" />
              <span>헬로커넥트앤</span>
            </div>
            
            <div className="flex items-center gap-3 w-full justify-center md:justify-end">
             <button 
                onClick={() => setViewMode(viewMode === 'daily' ? 'monthly' : 'daily')}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-800/90 border border-slate-600 rounded-2xl shadow-lg text-base font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all backdrop-blur-sm hover:-translate-y-1"
             >
                {viewMode === 'daily' ? <><Calendar size={20} /> 월간 달력 보기</> : <><List size={20} /> 상세 일별 뷰</>}
             </button>
             <button 
                onClick={downloadCSV}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-500 text-white rounded-2xl shadow-lg shadow-indigo-500/30 text-base font-bold hover:bg-indigo-400 hover:shadow-indigo-400/40 transition-all hover:-translate-y-1"
             >
                <Download size={20} />
                엑셀 다운로드
             </button>
            </div>
          </div>
        </header>

        {/* Date Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-5 rounded-3xl shadow-md border-2 border-slate-200 gap-4">
          <div className="flex items-center gap-6">
            <button 
                onClick={() => viewMode === 'daily' ? setSelectedDate(dateFns.subDays(selectedDate, 1)) : setCurrentDate(dateFns.subMonths(currentDate, 1))}
                className="p-3 hover:bg-slate-100 rounded-2xl transition-colors bg-slate-50 border-2 border-slate-200 shadow-sm"
            >
              <ChevronLeft size={24} className="text-slate-700" />
            </button>
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 w-64 text-center tracking-tight">
              {viewMode === 'daily' 
                  ? dateFns.format(selectedDate, 'yyyy년 MM월 dd일')
                  : dateFns.format(currentDate, 'yyyy년 MM월')}
            </h2>
            <button 
                onClick={() => viewMode === 'daily' ? setSelectedDate(dateFns.addDays(selectedDate, 1)) : setCurrentDate(dateFns.addMonths(currentDate, 1))}
                className="p-3 hover:bg-slate-100 rounded-2xl transition-colors bg-slate-50 border-2 border-slate-200 shadow-sm"
            >
              <ChevronRight size={24} className="text-slate-700" />
            </button>
          </div>
          {viewMode === 'daily' && (
              <button 
                  onClick={() => setSelectedDate(new Date())}
                  className="px-6 py-3 text-base font-extrabold text-indigo-700 bg-indigo-50 rounded-2xl hover:bg-indigo-100 transition-colors border-2 border-indigo-200 shadow-sm w-full sm:w-auto"
              >
                  오늘 날짜로 이동
              </button>
          )}
        </div>

        {/* Render Views */}
        {viewMode === 'daily' ? renderDailyView() : renderMonthlyView()}

        {}
        {alertConfig.isOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4 transition-opacity">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full p-8 text-center transform transition-all border border-slate-100">
              <div className="mx-auto w-16 h-16 bg-amber-100 text-amber-500 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                <Info size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-3">알림</h3>
              <p className="text-slate-600 mb-8 font-bold text-lg leading-relaxed">{alertConfig.message}</p>
              <button 
                onClick={() => setAlertConfig({ isOpen: false, message: '' })}
                className="w-full px-5 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-bold text-lg transition-all shadow-lg shadow-indigo-200"
              >
                확인했습니다
              </button>
            </div>
          </div>
        )}

        {deleteConfig.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-opacity">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 transform transition-all border border-slate-100">
              <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-50 text-red-600 rounded-2xl border border-red-100">
                    <Trash2 size={24} />
                  </div>
                  <h3 className="text-2xl font-black text-slate-800">등록된 일정 삭제</h3>
                </div>
                <button onClick={() => setDeleteConfig({ ...deleteConfig, isOpen: false })} className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-200 mb-6 space-y-3">
                <div className="flex items-center justify-between text-base">
                    <span className="text-slate-500 font-bold">작업유형</span>
                    <span className="text-slate-800 font-black">{deleteConfig.existingSchedule?.title}</span>
                </div>
                {(deleteConfig.existingSchedule?.region || deleteConfig.existingSchedule?.building) && (
                    <div className="flex items-center justify-between text-base">
                        <span className="text-slate-500 font-bold">장소</span>
                        <span className="text-slate-800 font-black">
                            {deleteConfig.existingSchedule?.region} {deleteConfig.existingSchedule?.building}
                        </span>
                    </div>
                )}
                <div className="flex items-center justify-between text-base">
                    <span className="text-slate-500 font-bold">소요시간</span>
                    <span className="text-slate-800 font-black">{deleteConfig.existingSchedule?.displayTime}</span>
                </div>
                <div className="flex items-center justify-between text-base border-t-2 border-slate-200 pt-3 mt-2">
                    <span className="text-slate-500 font-bold">등록자</span>
                    <span className="text-indigo-600 font-black">{deleteConfig.existingSchedule?.author}</span>
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-base font-bold text-slate-700 mb-3">관리자 코드 (보안 인증)</label>
                <input 
                  type="password" 
                  maxLength={4}
                  value={deleteConfig.password}
                  onChange={(e) => setDeleteConfig({...deleteConfig, password: e.target.value})}
                  placeholder="숫자 4자리 입력 (기본: 1470)"
                  className="w-full px-5 py-4 border-2 border-slate-300 rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-red-500/20 focus:border-red-500 text-center tracking-[0.5em] text-2xl font-black transition-all"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && submitDeleteSchedule()}
                />
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setDeleteConfig({ ...deleteConfig, isOpen: false })}
                  className="flex-1 px-5 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl hover:bg-slate-50 hover:border-slate-300 font-bold text-lg transition-all"
                >
                  취소
                </button>
                <button 
                  onClick={submitDeleteSchedule}
                  className="flex-1 px-5 py-4 bg-red-600 text-white rounded-2xl hover:bg-red-700 font-bold text-lg transition-all shadow-lg shadow-red-200"
                >
                  삭제 승인
                </button>
              </div>
            </div>
          </div>
        )}

        {addModalConfig.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-6 md:p-8 my-8 border border-slate-100">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <Calendar className="text-indigo-600" size={28} />
                  새 일정 등록
                  <span className="bg-indigo-100 text-indigo-700 text-sm px-3 py-1 rounded-full font-bold">
                      {addModalConfig.slotKey} 시작
                  </span>
                </h3>
                <button onClick={() => setAddModalConfig({ ...addModalConfig, isOpen: false })} className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2 transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* 1. 작업 유형 */}
              <div className="mb-8">
                <label className="block text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                    작업 유형 선택
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {workTypes.map(wt => (
                    <button
                      key={wt.id}
                      onClick={() => setAddFormWorkType(wt.id)}
                      className={`px-4 py-4 rounded-2xl border-2 text-base font-bold transition-all text-center flex flex-col items-center justify-center gap-1 ${
                        addFormWorkType === wt.id 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md' 
                          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-slate-50'
                      }`}
                    >
                      {wt.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. 소요 시간 */}
              <div className="mb-8">
                <label className="block text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                    작업 소요 시간
                </label>
                <div className="flex gap-4">
                    <div className="flex-1 relative">
                        <select 
                            value={addFormHours}
                            onChange={(e) => setAddFormHours(Number(e.target.value))}
                            className="w-full px-5 py-4 border-2 border-slate-300 rounded-2xl shadow-sm appearance-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-slate-700 bg-white text-center text-lg"
                        >
                            {[...Array(9)].map((_, i) => (
                                <option key={i} value={i}>{i}시간</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                           <ChevronRight size={20} className="rotate-90" />
                        </div>
                    </div>
                    <div className="flex-1 relative">
                        <select 
                            value={addFormMinutes}
                            onChange={(e) => setAddFormMinutes(Number(e.target.value))}
                            className="w-full px-5 py-4 border-2 border-slate-300 rounded-2xl shadow-sm appearance-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-slate-700 bg-white text-center text-lg"
                        >
                            {[0, 10, 20, 30, 40, 50].map(m => (
                                <option key={m} value={m}>{m}분</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                           <ChevronRight size={20} className="rotate-90" />
                        </div>
                    </div>
                </div>
              </div>

              {/* 3. 장소 상세 */}
              <div className="mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <label className="block text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
                    장소 정보 (선택 사항)
                </label>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                            <MapPin size={18} />
                        </div>
                        <input 
                            type="text" 
                            value={addFormRegion}
                            onChange={(e) => setAddFormRegion(e.target.value)}
                            className="w-full pl-11 pr-4 py-3.5 border-2 border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-base transition-all bg-white"
                            placeholder="지역명 (예: 강남구)"
                        />
                    </div>
                    <div className="flex-1 relative">
                         <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                            <Building2 size={18} />
                        </div>
                        <input 
                            type="text" 
                            value={addFormBuilding}
                            onChange={(e) => setAddFormBuilding(e.target.value)}
                            className="w-full pl-11 pr-4 py-3.5 border-2 border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-base transition-all bg-white"
                            placeholder="건물명 (예: 더샵아파트)"
                        />
                    </div>
                </div>
              </div>

              {/* 4. 상세내용/메모 */}
              <div className="mb-10">
                <label className="block text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">4</span>
                    상세내용 (간단 메모)
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <AlignLeft size={20} />
                    </div>
                    <input 
                      type="text" 
                      value={addFormMemo}
                      onChange={(e) => setAddFormMemo(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 border-2 border-slate-300 rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-lg transition-all"
                      placeholder="예: 장비 교체, 현장 정기 점검 등"
                    />
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t-2 border-slate-100">
                <button 
                  onClick={() => setAddModalConfig({ isOpen: false, techId: null, slotKey: null, dateKey: null })} 
                  className="flex-1 px-5 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl hover:bg-slate-50 hover:border-slate-300 font-bold text-lg transition-all"
                >
                  취소
                </button>
                <button 
                  onClick={handlePreSubmitAddSchedule} 
                  className="flex-1 px-5 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-bold text-lg shadow-xl shadow-indigo-200 transition-all flex justify-center items-center gap-2"
                >
                  <Calendar size={20} />
                  등록 완료
                </button>
              </div>
            </div>
          </div>
        )}

        {overtimeConfig.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4 transition-opacity">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full p-8 text-center transform transition-all border border-slate-100">
              <div className="mx-auto w-16 h-16 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-3">연장 근무 알림</h3>
              <p className="text-slate-600 mb-8 font-bold text-base leading-relaxed">
                설정한 작업 시간이 정규 근무시간(18:00)을 초과합니다.<br/>
                그래도 등록을 진행하시겠습니까?
              </p>
              <div className="flex gap-3">
                <button 
                    onClick={() => setOvertimeConfig({ isOpen: false, updates: null, dateKey: null })}
                    className="flex-1 px-4 py-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-bold transition-all"
                >
                    취소하기
                </button>
                <button 
                    onClick={() => executeAddSchedule(overtimeConfig.updates, overtimeConfig.dateKey)}
                    className="flex-1 px-4 py-4 bg-red-500 text-white rounded-xl hover:bg-red-600 font-bold transition-all shadow-md shadow-red-200"
                >
                    초과근무 등록
                </button>
              </div>
            </div>
          </div>
        )}

        {nameModalOpen && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[150] p-4 transition-opacity">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full p-8 border border-slate-100 transform scale-100">
              <div className="flex flex-col items-center justify-center mb-8">
                  <div className="w-20 h-20 rounded-3xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-5 shadow-inner border-2 border-indigo-100">
                      <User size={40} />
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">접속자 확인</h3>
              </div>
              
              <div className="mb-10">
                  <p className="text-slate-600 font-bold mb-6 text-base text-center bg-slate-50 p-4 rounded-xl border border-slate-100 leading-relaxed">
                      클라우드 동기화 시스템입니다.<br/>
                      등록/삭제 시 표시될 <br/><span className="text-indigo-600 font-black text-lg mt-1 block">본인의 이름을 입력해 주세요.</span>
                  </p>
                  <input 
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="예) 홍길동"
                      className="w-full px-5 py-4 border-2 border-slate-300 rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-black text-center text-2xl transition-all"
                      autoFocus
                      onKeyDown={(e) => { 
                          if (e.key === 'Enter') {
                              const nameToSave = tempName.trim();
                              if (!nameToSave) return;
                              if (nameToSave.includes(' ')) {
                                  showAlert("이름에 띄어쓰기(공백)를 포함할 수 없습니다. 직급을 제외한 이름만 입력해주세요.");
                                  return;
                              }
                              if (currentUserIp) localStorage.setItem(`hc_smss_name_${currentUserIp}`, nameToSave);
                              localStorage.setItem('hc_smss_username', nameToSave);
                              setUserName(nameToSave);
                              setNameModalOpen(false);
                          }
                      }}
                  />
              </div>

              <button 
                  disabled={!tempName.trim()}
                  onClick={() => {
                      const nameToSave = tempName.trim();
                      if (nameToSave.includes(' ')) {
                          showAlert("이름에 띄어쓰기(공백)를 포함할 수 없습니다.");
                          return;
                      }
                      if (currentUserIp) localStorage.setItem(`hc_smss_name_${currentUserIp}`, nameToSave);
                      localStorage.setItem('hc_smss_username', nameToSave);
                      setUserName(nameToSave);
                      setNameModalOpen(false);
                  }} 
                  className="w-full px-5 py-5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-black shadow-xl shadow-indigo-200 transition-all text-xl"
              >
                  시스템 접속하기
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}