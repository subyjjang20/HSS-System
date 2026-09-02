import React, { useState, useEffect } from 'react';
import * as dateFns from 'date-fns';
import { 
  Calendar, List, Download, ChevronLeft, ChevronRight, AlertCircle, 
  Info, Trash2, X, User, Zap, Network, Clock, AlignLeft, 
  MapPin, Building2, Cloud, UserPlus, Users, Edit2, PlusCircle, Check
} from 'lucide-react';
import { format, getDay, parseISO, eachDayOfInterval } from 'date-fns';
import { ko } from 'date-fns/locale';

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

// 기본 기술자 명단 (초기값)
const defaultTechnicians = [
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

// 작업 유형 및 디폴트 시간 설정 (전기차 3시간, 나머지 8시간)
const workTypes = [
  { id: 'ev', name: '전기차충전기', color: 'bg-blue-100 text-blue-900 border-blue-400 hover:ring-blue-500', defaultHours: 3, defaultMinutes: 0 },
  { id: 'cctv', name: 'CCTV', color: 'bg-emerald-100 text-emerald-900 border-emerald-400 hover:ring-emerald-500', defaultHours: 8, defaultMinutes: 0 },
  { id: 'maint', name: '정보통신유지보수', color: 'bg-amber-100 text-amber-900 border-amber-400 hover:ring-amber-500', defaultHours: 8, defaultMinutes: 0 },
  { id: 'libero', name: '리베로', color: 'bg-purple-100 text-purple-900 border-purple-400 hover:ring-purple-500', defaultHours: 8, defaultMinutes: 0 },
  { id: 'vacation', name: '휴가', color: 'bg-rose-100 text-rose-900 border-rose-400 hover:ring-rose-500', defaultHours: 8, defaultMinutes: 0 },
];

// 10분 단위 슬롯 생성 (09:00 ~ 18:50)
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

// 날짜 색상 클래스 (토요일: 파랑, 일/공휴일: 빨강)
const getDateColorClass = (dateObj: Date) => {
    const day = getDay(dateObj); 
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    
    const holidays = [
        '2026-01-01', '2026-03-01', '2026-05-05', '2026-06-06', 
        '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26', 
        '2026-10-03', '2026-10-09', '2026-12-25'
    ];

    if (day === 0 || holidays.includes(dateStr)) return 'text-red-600';
    if (day === 6) return 'text-blue-600';
    return 'text-slate-800';
};

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [schedules, setSchedules] = useState<Record<string, any>>({}); 
  const [techniciansList, setTechniciansList] = useState<Array<{id: number, team: string, center: string, name: string}>>(defaultTechnicians);
  
  const [cloudStatus, setCloudStatus] = useState('connecting');
  const [cloudErrorDetail, setCloudErrorDetail] = useState(''); 
  const [dbInstance, setDbInstance] = useState<any>(null);

  // 모달 관리 상태들
  const [alertConfig, setAlertConfig] = useState({ isOpen: false, message: '' });
  const [deleteConfig, setDeleteConfig] = useState<{isOpen: boolean, dateKey: string|null, techId: number|null, existingSchedule: any, password: string}>({ isOpen: false, dateKey: null, techId: null, existingSchedule: null, password: '' });
  const [addModalConfig, setAddModalConfig] = useState<{isOpen: boolean, techId: number|null, slotKey: string|null, dateKey: string|null, editTaskId?: string|null}>({ isOpen: false, techId: null, slotKey: null, dateKey: null });
  const [overtimeConfig, setOvertimeConfig] = useState<{isOpen: boolean, updates: any, dateKey: string|null}>({ isOpen: false, updates: null, dateKey: null });
  const [techModalOpen, setTechModalOpen] = useState(false);
  
  // 기술자 관리 폼 상태
  const [techFormMode, setTechFormMode] = useState<'add' | 'edit'>('add');
  const [editingTechId, setEditingTechId] = useState<number | null>(null);
  const [inputTeam, setInputTeam] = useState('수도권');
  const [inputCenter, setInputCenter] = useState('');
  const [inputName, setInputName] = useState('');
  const [techAdminPw, setTechAdminPw] = useState('');

  // 엑셀 기간 다운로드
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelStartDate, setExcelStartDate] = useState(dateFns.format(new Date(), 'yyyy-MM-dd'));
  const [excelEndDate, setExcelEndDate] = useState(dateFns.format(new Date(), 'yyyy-MM-dd'));
  
  // 일정 추가(수정) 폼
  const [addFormWorkType, setAddFormWorkType] = useState('ev');
  const [addFormHours, setAddFormHours] = useState(3); // 기본 EV 3시간
  const [addFormMinutes, setAddFormMinutes] = useState(0); 
  const [addFormRegion, setAddFormRegion] = useState('');
  const [addFormBuilding, setAddFormBuilding] = useState('');
  const [addFormMemo, setAddFormMemo] = useState('');

  // 사용자 로그인 관련
  const [userName, setUserName] = useState('');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [tempName, setTempName] = useState('');
  const [currentUserIp, setCurrentUserIp] = useState<string|null>(null);

  const showAlert = (message: string) => setAlertConfig({ isOpen: true, message });

  useEffect(() => {
    document.title = "HSS 시스템 - 실시간 스케줄러";

    const initUser = async () => {
        let ip = 'unknown';
        try {
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            ip = data.ip;
            setCurrentUserIp(ip);
        } catch (e) {
            console.warn("IP 조회 우회");
        }

        try {
            const storedName = localStorage.getItem(ip !== 'unknown' ? `hc_smss_name_${ip}` : 'hc_smss_username');
            if (storedName) setUserName(storedName);
            else setNameModalOpen(true);
        } catch (e) {
            setNameModalOpen(true);
        }
    };
    initUser();

    let unsubAuth: any = null;
    let unsubSnapshotSchedules: any = null;
    let unsubSnapshotTechs: any = null;

    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        setDbInstance(db);
        
        signInAnonymously(auth).catch((error) => {
            setCloudStatus('error');
            setCloudErrorDetail(`인증 차단: ${error.message}`);
        });

        unsubAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                // 1. 스케줄 데이터 구독
                const schedulesRef = collection(db, 'artifacts', 'hss-system', 'public', 'data', 'schedules');
                unsubSnapshotSchedules = onSnapshot(schedulesRef, (snapshot) => {
                    const newData: Record<string, any> = {};
                    snapshot.forEach(doc => { newData[doc.id] = doc.data(); });
                    setSchedules(newData);
                    setCloudStatus('connected');
                    setCloudErrorDetail('');
                }, (error) => {
                    setCloudStatus('error');
                    setCloudErrorDetail(`DB 접근 차단: ${error.code}`);
                });

                // 2. 기술자 명단 실시간 구독
                const techDocRef = doc(db, 'artifacts', 'hss-system', 'public', 'data', 'settings', 'technicians');
                unsubSnapshotTechs = onSnapshot(techDocRef, (docSnap) => {
                    if (docSnap.exists() && docSnap.data().list) {
                        setTechniciansList(docSnap.data().list);
                    } else {
                        setDoc(techDocRef, { list: defaultTechnicians }, { merge: true });
                    }
                });
            } else {
                setCloudStatus('connecting');
            }
        });
    } catch(err) {
        setCloudStatus('error');
        setCloudErrorDetail(`초기화 실패`);
    }

    return () => {
        if (unsubAuth) unsubAuth();
        if (unsubSnapshotSchedules) unsubSnapshotSchedules();
        if (unsubSnapshotTechs) unsubSnapshotTechs();
    };
  }, []);

  const handleCellClick = (techId: number, slotKey: string, dateKey: string) => {
    const existingSchedule = schedules[dateKey]?.[`${techId}_${slotKey}`];
    
    if (existingSchedule) {
      setDeleteConfig({ isOpen: true, dateKey, techId, existingSchedule, password: '' });
    } else {
      setAddModalConfig({ isOpen: true, techId, slotKey, dateKey, editTaskId: null });
      setAddFormWorkType('ev');
      setAddFormHours(3); // 전기차 기본 3시간
      setAddFormMinutes(0);
      setAddFormRegion('');
      setAddFormBuilding('');
      setAddFormMemo('');
    }
  };

  const handleWorkTypeChange = (wtId: string) => {
    setAddFormWorkType(wtId);
    const found = workTypes.find(w => w.id === wtId);
    if (found) {
        setAddFormHours(found.defaultHours);
        setAddFormMinutes(found.defaultMinutes);
    }
  };

  const handlePreSubmitAddSchedule = () => {
    const { techId, slotKey, dateKey, editTaskId } = addModalConfig;
    const workType = workTypes.find(wt => wt.id === addFormWorkType);
    
    if (!techId || !slotKey || !dateKey || !workType) return;

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

    while (blocksCount < blocksNeeded && currentIndex < VALID_SLOTS.length) {
        const currentSlot = VALID_SLOTS[currentIndex];
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

    const hasOverlap = slotsToFill.some(s => {
        const existing = currentDaySchedule[`${techId}_${s}`];
        if (existing && existing.taskId === editTaskId) return false;
        return !!existing;
    });

    if (hasOverlap) {
        showAlert("선택한 시간대에 이미 다른 일정이 등록되어 있어 중복됩니다.");
        return;
    }

    let displayTime = '';
    if (addFormHours > 0) displayTime += `${addFormHours}시간 `;
    if (addFormMinutes > 0) displayTime += `${addFormMinutes}분`;
    displayTime = displayTime.trim();

    const taskId = editTaskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const updates: Record<string, any> = {};

    if (editTaskId) {
        Object.keys(currentDaySchedule).forEach(key => {
            if (key.startsWith(`${techId}_`) && currentDaySchedule[key].taskId === editTaskId) {
                updates[key] = deleteField();
            }
        });
    }

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
            isStart: index === 0,
            duration: blocksNeeded
        };
    });

    const hasOvertime = slotsToFill.some(s => s >= "18:00");
    if (hasOvertime) {
        setOvertimeConfig({ isOpen: true, updates, dateKey });
    } else {
        executeAddSchedule(updates, dateKey);
    }
  };

  const executeAddSchedule = async (updates: any, targetDateKey: string|null) => {
    if (!dbInstance || !targetDateKey) return;
    try {
        const docRef = doc(dbInstance, 'artifacts', 'hss-system', 'public', 'data', 'schedules', targetDateKey);
        await setDoc(docRef, updates, { merge: true });
        
        setAddModalConfig({ isOpen: false, techId: null, slotKey: null, dateKey: null });
        setOvertimeConfig({ isOpen: false, updates: null, dateKey: null });
    } catch (err) {
        showAlert("클라우드 저장 중 오류가 발생했습니다.");
    }
  };

  const handleEditClick = () => {
    if (deleteConfig.password !== '1470') {
      showAlert("관리자 코드가 일치하지 않습니다.");
      return;
    }

    const { dateKey, techId, existingSchedule } = deleteConfig;
    if (!dateKey || !techId || !existingSchedule) return;

    const currentDaySchedule = schedules[dateKey] || {};
    const taskIdToEdit = existingSchedule.taskId;

    const startSlot = VALID_SLOTS.find(s => currentDaySchedule[`${techId}_${s}`]?.taskId === taskIdToEdit);
    if (!startSlot) return;

    const durationBlocks = existingSchedule.duration || 1;
    const totalMinutes = durationBlocks * 10;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    setAddFormWorkType(existingSchedule.workTypeId);
    setAddFormHours(hours);
    setAddFormMinutes(minutes);
    setAddFormRegion(existingSchedule.region || '');
    setAddFormBuilding(existingSchedule.building || '');
    setAddFormMemo(existingSchedule.memo || '');

    setAddModalConfig({ isOpen: true, techId, slotKey: startSlot, dateKey, editTaskId: taskIdToEdit });
    setDeleteConfig({ isOpen: false, dateKey: null, techId: null, existingSchedule: null, password: '' });
  };

  const submitDeleteSchedule = async () => {
    if (deleteConfig.password !== '1470') {
      showAlert("관리자 코드가 일치하지 않습니다.");
      return;
    }
    if (!dbInstance || !deleteConfig.dateKey) return;

    const { dateKey, techId, existingSchedule } = deleteConfig;
    const currentDaySchedule = schedules[dateKey] || {};
    const taskIdToDelete = existingSchedule?.taskId;
    if(!taskIdToDelete) return;

    const updates: Record<string, any> = {};
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
        showAlert("일정 삭제 중 오류가 발생했습니다.");
    }
  };

  const handleSaveTechnician = async () => {
    if (techAdminPw !== '1470') {
      showAlert("관리자 코드가 일치하지 않습니다.");
      return;
    }
    if (!inputCenter.trim() || !inputName.trim()) {
      showAlert("센터명과 이름을 모두 입력해 주세요.");
      return;
    }
    if (!dbInstance) return;

    let updatedList = [...techniciansList];

    if (techFormMode === 'add') {
      const newId = updatedList.length > 0 ? Math.max(...updatedList.map(t => t.id)) + 1 : 1;
      updatedList.push({
        id: newId,
        team: inputTeam.trim(),
        center: inputCenter.trim(),
        name: inputName.trim()
      });
    } else if (techFormMode === 'edit' && editingTechId !== null) {
      updatedList = updatedList.map(t => {
        if (t.id === editingTechId) {
          return { ...t, team: inputTeam.trim(), center: inputCenter.trim(), name: inputName.trim() };
        }
        return t;
      });
    }

    const teamOrder: Record<string, number> = { '수도권': 1, '동부': 2, '남부': 3 };
    updatedList.sort((a, b) => {
      const orderA = teamOrder[a.team] || 99;
      const orderB = teamOrder[b.team] || 99;
      if (orderA !== orderB) return orderA - orderB;
      if (a.center !== b.center) return a.center.localeCompare(b.center, 'ko');
      return a.name.localeCompare(b.name, 'ko');
    });

    try {
      const techDocRef = doc(dbInstance, 'artifacts', 'hss-system', 'public', 'data', 'settings', 'technicians');
      await setDoc(techDocRef, { list: updatedList }, { merge: true });
      
      setTechFormMode('add');
      setEditingTechId(null);
      setInputCenter('');
      setInputName('');
      setTechAdminPw('');
      showAlert(techFormMode === 'add' ? "담당자가 추가되었습니다." : "담당자 정보가 수정되었습니다.");
    } catch (e) {
      showAlert("저장 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteTechnician = async (techId: number) => {
    if (techAdminPw !== '1470') {
      showAlert("기술자를 삭제하려면 하단에 관리자 코드를 입력해야 합니다.");
      return;
    }
    if (!dbInstance) return;

    const updatedList = techniciansList.filter(t => t.id !== techId);
    try {
      const techDocRef = doc(dbInstance, 'artifacts', 'hss-system', 'public', 'data', 'settings', 'technicians');
      await setDoc(techDocRef, { list: updatedList }, { merge: true });
      showAlert("기술자가 명단에서 삭제되었습니다.");
    } catch (e) {
      showAlert("삭제 중 오류가 발생했습니다.");
    }
  };

  const handleDownloadExcelRange = () => {
    try {
        const start = parseISO(excelStartDate);
        const end = parseISO(excelEndDate);
        const days = eachDayOfInterval({ start, end });
        
        let csvContent = "\uFEFF"; 
        csvContent += "일자,순번,팀,센터,성명," + VALID_SLOTS.join(',') + "\n";

        days.forEach(day => {
            const dateKey = dateFns.format(day, 'yyyy-MM-dd');
            const displayDateStr = dateFns.format(day, 'yy.MM.dd(EEE)', { locale: ko }); 
            
            techniciansList.forEach((tech, index) => {
                let row = `${displayDateStr},${index + 1},${tech.team},${tech.center},${tech.name}`;
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
                            row += `,"(${sch.title})"`; 
                        }
                    } else {
                        row += ",";
                    }
                });
                csvContent += row + "\n";
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `HSS_스케줄_${excelStartDate}_부터_${excelEndDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExcelModal(false);
    } catch (e) {
        showAlert('날짜 형식이 올바르지 않거나 오류가 발생했습니다.');
    }
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
        <div className="grid grid-cols-7 mb-2 border-b-2 border-slate-300 pb-2 sm:pb-3">
            {weekDays.map((wd, i) => (
                <div key={i} className={`text-center font-bold text-xs sm:text-lg ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-700'}`}>
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
                Object.values(daySchedule).forEach((task: any) => uniqueTasks.add(task.taskId));
                taskCount = uniqueTasks.size;
            }

            const isCurrentMonth = dateFns.isSameMonth(day, monthStart);
            const isToday = dateFns.isSameDay(day, new Date());

            days.push(
                <div
                    key={day.toString()}
                    onClick={() => { setSelectedDate(cloneDay); setViewMode('daily'); }}
                    className={`min-h-[80px] sm:min-h-[140px] p-1.5 sm:p-3 border-r border-b border-slate-200 cursor-pointer transition-all hover:bg-indigo-50/60 
                        ${!isCurrentMonth ? "bg-slate-50 opacity-50" : "bg-white"}
                    `}
                >
                    <div className="flex justify-between items-start">
                         <span className={`text-xs sm:text-base font-extrabold flex items-center justify-center w-6 h-6 sm:w-10 sm:h-10 rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-md' : i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-800'}`}>
                            {formattedDate}
                        </span>
                    </div>
                    
                    {taskCount > 0 && (
                        <div className="mt-1 sm:mt-4 flex flex-col gap-1 sm:gap-2">
                            <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 text-[9px] sm:text-sm font-bold px-1 sm:px-3 py-1 sm:py-2 rounded-lg sm:rounded-xl text-center flex items-center justify-center gap-1 sm:gap-2 shadow-sm">
                                <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">총 {taskCount}건 등록됨</span>
                                <span className="sm:hidden">{taskCount}건</span>
                            </div>
                        </div>
                    )}
                </div>
            );
            day = dateFns.addDays(day, 1);
        }
        rows.push(<div className="grid grid-cols-7" key={day.toString()}>{days}</div>);
        days = [];
    }

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-md border-2 border-slate-200 p-2 sm:p-8 overflow-hidden">
            {header}
            <div className="border-t-2 border-l-2 border-slate-200 rounded-xl sm:rounded-2xl overflow-hidden mt-2 sm:mt-4">
                {rows}
            </div>
        </div>
    );
  };

  const renderDailyView = () => {
    const dateKey = dateFns.format(selectedDate, 'yyyy-MM-dd');
    const daySchedule = schedules[dateKey] || {};
    const skipCells = new Set(); 

    const getRightBorderStyle = (index: number) => {
        if (index === techniciansList.length - 1) return '2px solid #64748b';
        const current = techniciansList[index];
        const next = techniciansList[index + 1];
        if (current.team !== next.team) return '2px solid #64748b';
        if (current.center !== next.center) return '1px solid #94a3b8';
        return '1px dashed #cbd5e1';
    };

    const teamGroups: {name: string, count: number}[] = [];
    const centerGroups: {name: string, count: number, lastTechIndex: number}[] = [];
    techniciansList.forEach((tech, i) => {
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
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-md border-2 border-slate-200 overflow-hidden flex flex-col h-[75vh]">
            <div className="bg-indigo-50/50 border-b-2 border-slate-200 p-2 sm:p-3 flex justify-between items-center shrink-0">
                <span className="font-bold text-slate-600 flex items-start sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm">
                    <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5 sm:mt-0" />
                    <span className="leading-tight">시간 칸을 클릭하여 일정을 등록하세요.</span>
                </span>
                <button
                    onClick={() => setTechModalOpen(true)}
                    className="flex items-center gap-1 sm:gap-1.5 bg-white border border-indigo-200 text-indigo-700 px-2 sm:px-3 py-1 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold hover:bg-indigo-50 shadow-sm transition-all whitespace-nowrap"
                >
                    <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-600" />
                    <span>매니저 관리</span>
                </button>
            </div>

            <div className="overflow-x-auto overflow-y-auto flex-1 relative custom-scrollbar">
                <table className="w-max min-w-full border-separate border-spacing-0 table-fixed select-none">
                    <thead className="sticky top-0 z-30 shadow-sm bg-white">
                        <tr>
                            <th rowSpan={3} className="sticky left-0 z-40 bg-slate-200 p-1 sm:p-2 min-w-[40px] sm:min-w-[60px] w-[40px] sm:w-[60px] text-center text-slate-700 font-extrabold text-[10px] sm:text-sm shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                                style={{ borderRight: '2px solid #64748b', borderBottom: '2px solid #64748b' }}>
                                시간
                            </th>
                            {teamGroups.map((team, idx) => (
                                <th key={`team-${idx}`} colSpan={team.count} className="p-1 sm:p-1.5 text-center bg-indigo-50"
                                    style={{ borderRight: '2px solid #64748b', borderBottom: '1px solid #cbd5e1' }}>
                                    <div className="text-[10px] sm:text-xs text-indigo-700 font-black tracking-tight sm:tracking-widest">{team.name}</div>
                                </th>
                            ))}
                        </tr>
                        <tr>
                            {centerGroups.map((center, idx) => {
                                const isTeamBoundary = center.lastTechIndex === techniciansList.length - 1 || 
                                                       techniciansList[center.lastTechIndex].team !== techniciansList[center.lastTechIndex + 1]?.team;
                                return (
                                    <th key={`center-${idx}`} colSpan={center.count} className="p-0.5 sm:p-1 text-center bg-slate-50"
                                        style={{ borderRight: isTeamBoundary ? '2px solid #64748b' : '1px solid #94a3b8', borderBottom: '1px solid #cbd5e1' }}>
                                        <div className="text-[9px] sm:text-[11px] text-slate-600 font-bold">{center.name}</div>
                                    </th>
                                );
                            })}
                        </tr>
                        <tr>
                            {techniciansList.map((tech, index) => (
                                <th key={tech.id} className="p-1 sm:p-1.5 min-w-[60px] sm:min-w-[120px] w-[60px] sm:w-[120px] text-center bg-white"
                                    style={{ borderRight: getRightBorderStyle(index), borderBottom: '2px solid #64748b' }}>
                                    <div className="font-extrabold text-slate-900 text-[10px] sm:text-sm truncate px-0.5">{tech.name}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(() => {
                            const rows = [];
                            let addedLunchIndicator = false;

                            VALID_SLOTS.forEach((slot, slotIndex) => {
                                if (slot.startsWith("12:")) {
                                    if (!addedLunchIndicator) {
                                        rows.push(
                                            <tr key="lunch_break" className="pointer-events-none bg-slate-100" style={{ height: "30px" }}>
                                                <td className="sticky left-0 z-20 bg-slate-300 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                                                    style={{ borderRight: '2px solid #64748b', borderBottom: '2px solid #64748b' }}>
                                                    <span className="font-black tracking-tighter text-slate-600 text-[9px] sm:text-xs">12:00</span>
                                                </td>
                                                <td colSpan={techniciansList.length} className="text-center bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#e2e8f0_10px,#e2e8f0_20px)] opacity-90"
                                                    style={{ borderBottom: '2px solid #64748b', borderRight: '2px solid #64748b' }}>
                                                    <span className="font-extrabold text-slate-500 text-[10px] sm:text-sm tracking-widest flex items-center justify-center gap-1 sm:gap-2">
                                                        <Clock className="w-3 h-3 sm:w-4 sm:h-4" /> 점 심 시 간 (12:00 ~ 13:00)
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                        addedLunchIndicator = true;
                                    }
                                    return;
                                }

                                const isHourStart = slot.endsWith(":00");
                                const isHourEnd = slot.endsWith("50");
                                const isAfter18 = slot >= "18:00";
                                
                                rows.push(
                                    <tr key={slot} className="transition-colors group" style={{ height: "24px" }}>
                                        <td className={`sticky left-0 z-20 p-0 text-center ${isAfter18 ? 'bg-red-50/30' : 'bg-white'}`}
                                            style={{ 
                                                borderRight: '2px solid #64748b', 
                                                borderBottom: isHourEnd ? '2px solid #64748b' : '1px dashed #cbd5e1' 
                                            }}>
                                            <div className="h-full flex items-center justify-center">
                                                <span className={isHourStart ? "font-bold text-slate-700 text-[9px] sm:text-sm" : "font-medium text-slate-400 text-[7px] sm:text-[10px]"}>{slot}</span>
                                            </div>
                                        </td>
                                        
                                        {techniciansList.map((tech, index) => {
                                            const cellKey = `${tech.id}_${slot}`;
                                            if (skipCells.has(cellKey)) return null;

                                            const schedule = daySchedule[cellKey];
                                            if (schedule) {
                                                let rSpan = 1;
                                                const isMorning = slot < "12:00";
                                                
                                                for (let i = slotIndex + 1; i < VALID_SLOTS.length; i++) {
                                                    const nextSlot = VALID_SLOTS[i];
                                                    if (nextSlot.startsWith("12:")) continue;
                                                    
                                                    const nextTask = daySchedule[`${tech.id}_${nextSlot}`];
                                                    
                                                    if (nextTask && nextTask.taskId === schedule.taskId) {
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
                                                            borderBottom: '2px solid #64748b'
                                                        }}
                                                    >
                                                        <div className="absolute inset-0 w-full h-full flex flex-col p-0.5 sm:p-1.5 overflow-hidden z-10">
                                                            <div className="font-extrabold text-[9px] sm:text-xs leading-none sm:leading-tight truncate flex items-center gap-0.5 sm:gap-1">
                                                                {schedule.title}
                                                                {!schedule.isStart && <span className="font-medium text-[7px] sm:text-[9px] opacity-70 bg-black/10 px-0.5 sm:px-1 rounded">(계속)</span>}
                                                            </div>
                                                            
                                                            {rSpan >= 2 && (
                                                                <div className="flex flex-col mt-0.5 gap-0 sm:gap-0.5 opacity-90 text-[8px] sm:text-[10px] leading-tight w-full">
                                                                    {(schedule.region || schedule.building) && (
                                                                        <div className="font-bold truncate w-full text-black/70">
                                                                            {schedule.region} {schedule.building}
                                                                        </div>
                                                                    )}
                                                                    {schedule.memo && (
                                                                        <div className="font-medium truncate opacity-85 w-full hidden sm:block">
                                                                            {schedule.memo}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            
                                                            {rSpan >= 3 && (
                                                                <div className="mt-auto pt-0.5 sm:pt-1 text-[7px] sm:text-[10px] font-bold opacity-75 flex items-center gap-0.5 justify-end">
                                                                    <User className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                                                                    <span className="truncate max-w-[40px] sm:max-w-none">{schedule.author}</span>
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
                                                        <span className="text-indigo-600 font-bold text-[10px] sm:text-xs">+</span>
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
            
            <style dangerouslySetInnerHTML={{__html: `
                .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                @media (min-width: 640px) {
                    .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                }
            `}} />
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-4 sm:space-y-6">
        
        {/* Header */}
        <header className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 20px 20px, white 2%, transparent 0%)', backgroundSize: '40px 40px' }}></div>
          
          <div className="flex flex-col relative z-10 w-full md:w-auto items-center md:items-start text-center md:text-left">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-3 bg-indigo-500/20 backdrop-blur-md rounded-xl sm:rounded-2xl text-indigo-300 border border-indigo-400/30 shadow-md">
                <Network className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <div className="flex flex-col">
                  <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">HSS 시스템</h1>
                  <span className="text-indigo-300 text-[9px] sm:text-xs md:text-sm font-bold tracking-widest mt-0.5 sm:mt-1">솔루션매니저 일정 관리</span>
              </div>
            </div>
            <div className="mt-2 sm:mt-5 flex flex-wrap justify-center items-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm bg-slate-800/80 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-slate-700/50 backdrop-blur-sm shadow-inner">
                {cloudStatus === 'connected' ? (
                    <><Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 fill-emerald-400/20" /><span className="text-emerald-300 font-bold">클라우드 실시간 동기화 중</span></>
                ) : cloudStatus === 'connecting' ? (
                    <><Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 animate-pulse" /><span className="text-amber-300 font-bold">서버 연결 중...</span></>
                ) : (
                    <><AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" /><span className="text-red-300 font-bold">오프라인 모드</span></>
                )}
                <div className="w-px h-3 sm:h-4 bg-slate-600 mx-1 sm:mx-2"></div>
                <User className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400" />
                <span className="text-slate-200 font-bold text-xs sm:text-base">{userName || '로그인 필요'}</span>
            </div>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-3 sm:gap-5 relative z-10 w-full md:w-auto mt-2 md:mt-0">
            <div className="flex items-center gap-1.5 sm:gap-2 text-white font-black text-lg sm:text-2xl tracking-wide bg-white/5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10 shadow-lg">
              <Zap className="w-4 h-4 sm:w-6 sm:h-6 text-amber-400 fill-amber-400/20" />
              <span>헬로커넥트앤</span>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 w-full justify-center md:justify-end">
             <button 
                onClick={() => setViewMode(viewMode === 'daily' ? 'monthly' : 'daily')}
                className="flex flex-1 md:flex-none items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 bg-slate-800/90 border border-slate-600 rounded-xl sm:rounded-2xl shadow-lg text-xs sm:text-sm font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all backdrop-blur-sm"
             >
                {viewMode === 'daily' ? <><Calendar className="w-4 h-4 sm:w-5 sm:h-5" /> 월간 보기</> : <><List className="w-4 h-4 sm:w-5 sm:h-5" /> 일별 보기</>}
             </button>
             <button 
                onClick={() => {
                    const formatted = dateFns.format(selectedDate, 'yyyy-MM-dd');
                    setExcelStartDate(formatted);
                    setExcelEndDate(formatted);
                    setShowExcelModal(true);
                }}
                className="flex flex-1 md:flex-none items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 bg-indigo-500 text-white rounded-xl sm:rounded-2xl shadow-lg shadow-indigo-500/30 text-xs sm:text-sm font-bold hover:bg-indigo-400 transition-all"
             >
                <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                엑셀 다운로드
             </button>
             <button 
                onClick={() => setTechModalOpen(true)}
                className="hidden sm:flex items-center justify-center gap-1.5 px-4 py-3 bg-slate-700 text-slate-200 rounded-2xl text-sm font-bold hover:bg-slate-600 transition-all border border-slate-600"
             >
                <Users className="w-4 h-4" />
                기술자 명단
             </button>
            </div>
          </div>
        </header>

        {/* Date Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-md border-2 border-slate-200 gap-3 sm:gap-4">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2 sm:gap-6">
            <button 
                onClick={() => viewMode === 'daily' ? setSelectedDate(dateFns.subDays(selectedDate, 1)) : setCurrentDate(dateFns.subMonths(currentDate, 1))}
                className="p-2 sm:p-3 hover:bg-slate-100 rounded-xl sm:rounded-2xl transition-colors bg-slate-50 border-2 border-slate-200 shadow-sm"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" />
            </button>
            <h2 className={`text-lg sm:text-2xl md:text-3xl font-black w-44 sm:w-72 text-center tracking-tight ${viewMode === 'daily' ? getDateColorClass(selectedDate) : 'text-slate-800'}`}>
              {viewMode === 'daily' 
                  ? dateFns.format(selectedDate, 'yy.MM.dd(EEE)', { locale: ko })
                  : dateFns.format(currentDate, 'yy.MM')}
            </h2>
            <button 
                onClick={() => viewMode === 'daily' ? setSelectedDate(dateFns.addDays(selectedDate, 1)) : setCurrentDate(dateFns.addMonths(currentDate, 1))}
                className="p-2 sm:p-3 hover:bg-slate-100 rounded-xl sm:rounded-2xl transition-colors bg-slate-50 border-2 border-slate-200 shadow-sm"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" />
            </button>
          </div>
          {viewMode === 'daily' && (
              <button 
                  onClick={() => setSelectedDate(new Date())}
                  className="px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-extrabold text-indigo-700 bg-indigo-50 rounded-xl sm:rounded-2xl hover:bg-indigo-100 transition-colors border-2 border-indigo-200 shadow-sm w-full sm:w-auto"
              >
                  오늘 날짜로 이동
              </button>
          )}
        </div>

        {/* Views */}
        {viewMode === 'daily' ? renderDailyView() : renderMonthlyView()}

        {/* 기술자 관리 모달 */}
        {techModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[140] p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl max-w-[95vw] sm:max-w-2xl w-full p-5 sm:p-8 border border-slate-100 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                <h3 className="text-lg sm:text-2xl font-black text-slate-800 flex items-center gap-2">
                  <Users className="text-indigo-600 w-5 h-5 sm:w-6 sm:h-6" />
                  기술자(담당자) 명단 관리
                </h3>
                <button onClick={() => setTechModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-1.5 sm:p-2">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* 기술자 추가/수정 폼 */}
              <div className="bg-slate-50 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 mb-4">
                <h4 className="text-xs sm:text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-indigo-600" />
                  {techFormMode === 'add' ? '새 기술자 추가' : '기술자 정보 수정'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-3">
                  <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-slate-500 mb-1">팀(권역)</label>
                    <select
                      value={inputTeam}
                      onChange={(e) => setInputTeam(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold bg-white"
                    >
                      <option value="수도권">수도권</option>
                      <option value="동부">동부</option>
                      <option value="남부">남부</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-slate-500 mb-1">센터명</label>
                    <input
                      type="text"
                      placeholder="예: 부평센터"
                      value={inputCenter}
                      onChange={(e) => setInputCenter(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-bold text-slate-500 mb-1">성명</label>
                    <input
                      type="text"
                      placeholder="예: 홍길동"
                      value={inputName}
                      onChange={(e) => setInputName(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="관리자 코드 (4자리)"
                      value={techAdminPw}
                      onChange={(e) => setTechAdminPw(e.target.value)}
                      className="w-36 px-3 py-1.5 border-2 border-slate-300 rounded-lg text-xs font-bold text-center bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    {techFormMode === 'edit' && (
                      <button
                        onClick={() => {
                          setTechFormMode('add');
                          setEditingTechId(null);
                          setInputCenter('');
                          setInputName('');
                        }}
                        className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                      >
                        수정 취소
                      </button>
                    )}
                    <button
                      onClick={handleSaveTechnician}
                      className="flex-1 sm:flex-none px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-200"
                    >
                      {techFormMode === 'add' ? '기술자 등록' : '수정 완료'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 현재 기술자 목록 테이블 */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2 sm:p-3">팀</th>
                      <th className="p-2 sm:p-3">센터</th>
                      <th className="p-2 sm:p-3">성명</th>
                      <th className="p-2 sm:p-3 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {techniciansList.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2 sm:p-3 font-semibold text-slate-700">{t.team}</td>
                        <td className="p-2 sm:p-3 font-medium text-slate-600">{t.center}</td>
                        <td className="p-2 sm:p-3 font-bold text-slate-900">{t.name}</td>
                        <td className="p-2 sm:p-3 text-center">
                          <div className="flex items-center justify-center gap-1 sm:gap-2">
                            <button
                              onClick={() => {
                                setTechFormMode('edit');
                                setEditingTechId(t.id);
                                setInputTeam(t.team);
                                setInputCenter(t.center);
                                setInputName(t.name);
                              }}
                              className="p-1 sm:p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition-colors"
                              title="수정"
                            >
                              <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTechnician(t.id)}
                              className="p-1 sm:p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                              title="삭제"
                            >
                              <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 엑셀 다운로드 모달 */}
        {showExcelModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 transition-opacity">
            <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl max-w-[90vw] sm:max-w-sm w-full p-6 sm:p-8 border border-slate-100">
              <div className="flex justify-between items-center mb-4 sm:mb-6 border-b border-slate-100 pb-3 sm:pb-4">
                <h3 className="text-base sm:text-xl font-black text-slate-800 flex items-center gap-2">
                  <Download className="text-indigo-600 w-4 h-4 sm:w-5 sm:h-5" />
                  엑셀 다운로드 기간 설정
                </h3>
                <button onClick={() => setShowExcelModal(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-1.5 sm:p-2">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              <div className="mb-3 sm:mb-4">
                <label className="block text-xs sm:text-sm font-bold text-slate-600 mb-1.5 sm:mb-2">시작일</label>
                <input 
                  type="date" 
                  value={excelStartDate} 
                  onChange={(e) => setExcelStartDate(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-slate-300 rounded-lg sm:rounded-xl font-bold text-slate-700 bg-white text-sm sm:text-base"
                />
              </div>
              <div className="mb-5 sm:mb-6">
                <label className="block text-xs sm:text-sm font-bold text-slate-600 mb-1.5 sm:mb-2">종료일</label>
                <input 
                  type="date" 
                  value={excelEndDate} 
                  onChange={(e) => setExcelEndDate(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-slate-300 rounded-lg sm:rounded-xl font-bold text-slate-700 bg-white text-sm sm:text-base"
                />
              </div>
              <div className="flex gap-2 sm:gap-3">
                <button 
                  onClick={() => setShowExcelModal(false)}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 bg-slate-100 text-slate-700 rounded-lg sm:rounded-xl hover:bg-slate-200 font-bold transition-all text-sm sm:text-base"
                >
                  취소
                </button>
                <button 
                  onClick={handleDownloadExcelRange}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 bg-indigo-600 text-white rounded-lg sm:rounded-xl hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200 transition-all text-sm sm:text-base"
                >
                  다운로드
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 알림 모달 */}
        {alertConfig.isOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4 transition-opacity">
            <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl max-w-[90vw] sm:max-w-sm w-full p-6 sm:p-8 text-center border border-slate-100">
              <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-amber-100 text-amber-500 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6 shadow-inner">
                <Info className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-slate-800 mb-2 sm:mb-3">알림</h3>
              <p className="text-slate-600 mb-6 sm:mb-8 font-bold text-xs sm:text-lg leading-relaxed">{alertConfig.message}</p>
              <button 
                onClick={() => setAlertConfig({ isOpen: false, message: '' })}
                className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-indigo-600 text-white rounded-xl sm:rounded-2xl hover:bg-indigo-700 font-bold text-sm sm:text-lg transition-all shadow-lg shadow-indigo-200"
              >
                확인했습니다
              </button>
            </div>
          </div>
        )}

        {/* 일정 상세 정보 (마우스오버 툴팁과 동일한 모든 내용 표기) 및 수정/삭제 모달 */}
        {deleteConfig.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-opacity">
            <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl max-w-[90vw] sm:max-w-md w-full p-5 sm:p-8 border border-slate-100">
              <div className="flex justify-between items-start mb-4 sm:mb-6 border-b border-slate-100 pb-3 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-2 sm:p-3 bg-indigo-50 text-indigo-600 rounded-xl sm:rounded-2xl border border-indigo-100">
                    <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <h3 className="text-lg sm:text-2xl font-black text-slate-800">일정 상세 정보</h3>
                </div>
                <button onClick={() => setDeleteConfig({ ...deleteConfig, isOpen: false })} className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-1.5 sm:p-2">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              
              <div className="bg-slate-50 p-4 sm:p-5 rounded-xl sm:rounded-2xl border-2 border-slate-200 mb-4 sm:mb-6 space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between text-xs sm:text-base">
                    <span className="text-slate-500 font-bold">작업유형</span>
                    <span className="text-slate-800 font-black">{deleteConfig.existingSchedule?.title}</span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-base">
                    <span className="text-slate-500 font-bold">소요시간</span>
                    <span className="text-slate-800 font-black">{deleteConfig.existingSchedule?.displayTime}</span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-base">
                    <span className="text-slate-500 font-bold">지역</span>
                    <span className="text-slate-800 font-black">{deleteConfig.existingSchedule?.region || '미입력'}</span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-base">
                    <span className="text-slate-500 font-bold">건물</span>
                    <span className="text-slate-800 font-black">{deleteConfig.existingSchedule?.building || '미입력'}</span>
                </div>
                
                {deleteConfig.existingSchedule?.memo && (
                    <div className="flex flex-col text-xs sm:text-base border-t-2 border-slate-200 pt-2 sm:pt-3 mt-1 sm:mt-2">
                        <span className="text-slate-500 font-bold mb-1.5">상세메모</span>
                        <span className="text-slate-800 font-medium bg-white p-2.5 sm:p-3 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed break-words">
                            {deleteConfig.existingSchedule?.memo}
                        </span>
                    </div>
                )}
                
                <div className="flex items-center justify-between text-xs sm:text-base border-t-2 border-slate-200 pt-2 sm:pt-3 mt-1 sm:mt-2">
                    <span className="text-slate-500 font-bold">등록자</span>
                    <span className="text-indigo-600 font-black">{deleteConfig.existingSchedule?.author}</span>
                </div>
              </div>

              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5 sm:mb-2 text-center">관리자 코드 (보안 인증)</label>
                <input 
                  type="password" 
                  maxLength={4}
                  value={deleteConfig.password}
                  onChange={(e) => setDeleteConfig({...deleteConfig, password: e.target.value})}
                  placeholder="숫자 4자리"
                  className="w-32 sm:w-40 mx-auto block px-3 sm:px-4 py-2 sm:py-3 border-2 border-slate-300 rounded-lg sm:rounded-xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 text-center tracking-[0.3em] sm:tracking-widest text-base sm:text-lg font-black transition-all"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-2 sm:gap-3">
                <button 
                  onClick={() => setDeleteConfig({ ...deleteConfig, isOpen: false })}
                  className="flex-1 px-2 sm:px-4 py-2.5 sm:py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-lg sm:rounded-xl hover:bg-slate-50 font-bold text-xs sm:text-base transition-all"
                >
                  취소
                </button>
                <button 
                  onClick={handleEditClick}
                  className="flex-1 px-2 sm:px-4 py-2.5 sm:py-3 bg-indigo-600 text-white rounded-lg sm:rounded-xl hover:bg-indigo-700 font-bold text-xs sm:text-base transition-all shadow-md shadow-indigo-200"
                >
                  수정
                </button>
                <button 
                  onClick={submitDeleteSchedule}
                  className="flex-1 px-2 sm:px-4 py-2.5 sm:py-3 bg-red-600 text-white rounded-lg sm:rounded-xl hover:bg-red-700 font-bold text-xs sm:text-base transition-all shadow-md shadow-red-200"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 새 일정 등록/수정 폼 모달 */}
        {addModalConfig.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl max-w-[90vw] sm:max-w-lg w-full p-5 sm:p-8 my-4 sm:my-8 border border-slate-100">
              <div className="flex justify-between items-center mb-4 sm:mb-6 border-b border-slate-100 pb-3 sm:pb-4">
                <h3 className="text-base sm:text-2xl font-black text-slate-800 flex items-center gap-2 sm:gap-3">
                  <Calendar className="text-indigo-600 w-5 h-5 sm:w-7 sm:h-7" />
                  {addModalConfig.editTaskId ? '일정 수정' : '새 일정 등록'}
                  <span className="bg-indigo-100 text-indigo-700 text-[10px] sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 rounded-full font-bold">
                      {addModalConfig.slotKey} 시작
                  </span>
                </h3>
                <button onClick={() => setAddModalConfig({ ...addModalConfig, isOpen: false })} className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-1.5 sm:p-2">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              <div className="mb-4 sm:mb-8">
                <label className="block text-xs sm:text-base font-bold text-slate-700 mb-2 sm:mb-4 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-sm">1</span>
                    작업 유형 선택 (유형별 디폴트 시간 적용)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  {workTypes.map(wt => (
                    <button
                      key={wt.id}
                      onClick={() => handleWorkTypeChange(wt.id)}
                      className={`px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 text-xs sm:text-sm font-bold transition-all text-center flex flex-col items-center justify-center gap-1 ${
                        addFormWorkType === wt.id 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md' 
                          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-slate-50'
                      }`}
                    >
                      {wt.name}
                      <span className="text-[10px] opacity-70 font-normal">
                        ({wt.defaultHours}시간)
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 sm:mb-8">
                <label className="block text-xs sm:text-base font-bold text-slate-700 mb-2 sm:mb-4 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-sm">2</span>
                    작업 소요 시간
                </label>
                <div className="flex gap-2 sm:gap-4">
                    <div className="flex-1 relative">
                        <select 
                            value={addFormHours}
                            onChange={(e) => setAddFormHours(Number(e.target.value))}
                            className="w-full px-3 sm:px-5 py-2.5 sm:py-4 border-2 border-slate-300 rounded-xl sm:rounded-2xl shadow-sm appearance-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-slate-700 bg-white text-center text-sm sm:text-lg"
                        >
                            {[...Array(13)].map((_, i) => (
                                <option key={i} value={i}>{i}시간</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 sm:px-4 text-slate-500">
                           <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 rotate-90" />
                        </div>
                    </div>
                    <div className="flex-1 relative">
                        <select 
                            value={addFormMinutes}
                            onChange={(e) => setAddFormMinutes(Number(e.target.value))}
                            className="w-full px-3 sm:px-5 py-2.5 sm:py-4 border-2 border-slate-300 rounded-xl sm:rounded-2xl shadow-sm appearance-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-slate-700 bg-white text-center text-sm sm:text-lg"
                        >
                            {[0, 10, 20, 30, 40, 50].map(m => (
                                <option key={m} value={m}>{m}분</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 sm:px-4 text-slate-500">
                           <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 rotate-90" />
                        </div>
                    </div>
                </div>
              </div>

              <div className="mb-4 sm:mb-8 bg-slate-50 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200">
                <label className="block text-xs sm:text-base font-bold text-slate-700 mb-2 sm:mb-4 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-sm">3</span>
                    장소 정보 (선택 사항)
                </label>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none text-slate-400">
                            <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <input 
                            type="text" 
                            value={addFormRegion}
                            onChange={(e) => setAddFormRegion(e.target.value)}
                            className="w-full pl-9 sm:pl-11 pr-3 sm:pr-4 py-2 sm:py-3.5 border-2 border-slate-300 rounded-lg sm:rounded-xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-xs sm:text-base transition-all bg-white"
                            placeholder="지역명 (예: 강남구)"
                        />
                    </div>
                    <div className="flex-1 relative">
                         <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none text-slate-400">
                            <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <input 
                            type="text" 
                            value={addFormBuilding}
                            onChange={(e) => setAddFormBuilding(e.target.value)}
                            className="w-full pl-9 sm:pl-11 pr-3 sm:pr-4 py-2 sm:py-3.5 border-2 border-slate-300 rounded-lg sm:rounded-xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-xs sm:text-base transition-all bg-white"
                            placeholder="건물명 (예: 더샵아파트)"
                        />
                    </div>
                </div>
              </div>

              <div className="mb-5 sm:mb-10">
                <label className="block text-xs sm:text-base font-bold text-slate-700 mb-2 sm:mb-4 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-sm">4</span>
                    상세내용 (간단 메모)
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none text-slate-400">
                        <AlignLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <input 
                      type="text" 
                      value={addFormMemo}
                      onChange={(e) => setAddFormMemo(e.target.value)}
                      className="w-full pl-9 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-4 border-2 border-slate-300 rounded-xl sm:rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-sm sm:text-lg transition-all"
                      placeholder="예: 장비 교체 등"
                    />
                </div>
              </div>

              <div className="flex justify-end gap-2 sm:gap-4 pt-4 sm:pt-6 border-t-2 border-slate-100">
                <button 
                  onClick={() => setAddModalConfig({ isOpen: false, techId: null, slotKey: null, dateKey: null })} 
                  className="flex-1 px-3 sm:px-5 py-3 sm:py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-xl sm:rounded-2xl hover:bg-slate-50 hover:border-slate-300 font-bold text-sm sm:text-lg transition-all"
                >
                  취소
                </button>
                <button 
                  onClick={handlePreSubmitAddSchedule} 
                  className="flex-1 px-3 sm:px-5 py-3 sm:py-4 bg-indigo-600 text-white rounded-xl sm:rounded-2xl hover:bg-indigo-700 font-bold text-sm sm:text-lg shadow-xl shadow-indigo-200 transition-all flex justify-center items-center gap-1.5 sm:gap-2"
                >
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
                  {addModalConfig.editTaskId ? '수정 완료' : '등록 완료'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 연장근무 확인 모달 */}
        {overtimeConfig.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4 transition-opacity">
            <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl max-w-[90vw] sm:max-w-sm w-full p-6 sm:p-8 text-center border border-slate-100">
              <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-red-100 text-red-500 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6 shadow-inner">
                <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-slate-800 mb-2 sm:mb-3">연장 근무 알림</h3>
              <p className="text-slate-600 mb-6 sm:mb-8 font-bold text-xs sm:text-base leading-relaxed">
                설정한 작업 시간이 정규 근무시간(18:00)을 초과합니다.<br/>
                그래도 등록을 진행하시겠습니까?
              </p>
              <div className="flex gap-2 sm:gap-3">
                <button 
                    onClick={() => setOvertimeConfig({ isOpen: false, updates: null, dateKey: null })}
                    className="flex-1 px-3 sm:px-4 py-3 sm:py-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-bold transition-all text-sm sm:text-base"
                >
                    취소하기
                </button>
                <button 
                    onClick={() => executeAddSchedule(overtimeConfig.updates, overtimeConfig.dateKey)}
                    className="flex-1 px-3 sm:px-4 py-3 sm:py-4 bg-red-500 text-white rounded-xl hover:bg-red-600 font-bold transition-all shadow-md shadow-red-200 text-sm sm:text-base"
                >
                    초과근무 등록
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 접속자 확인 모달 */}
        {nameModalOpen && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[160] p-4 transition-opacity">
            <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl max-w-[90vw] sm:max-w-sm w-full p-6 sm:p-8 border border-slate-100">
              <div className="flex flex-col items-center justify-center mb-6 sm:mb-8">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 sm:mb-5 shadow-inner border-2 border-indigo-100">
                      <User className="w-8 h-8 sm:w-10 sm:h-10" />
                  </div>
                  <h3 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">접속자 확인</h3>
              </div>
              
              <div className="mb-6 sm:mb-10">
                  <p className="text-slate-600 font-bold mb-4 sm:mb-6 text-xs sm:text-base text-center bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-100 leading-relaxed">
                      클라우드 동기화 시스템입니다.<br/>
                      등록/삭제 시 표시될 <br/><span className="text-indigo-600 font-black text-sm sm:text-lg mt-1 block">본인의 이름을 입력해 주세요.</span>
                  </p>
                  <input 
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="예) 홍길동"
                      className="w-full px-4 sm:px-5 py-3 sm:py-4 border-2 border-slate-300 rounded-xl sm:rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-black text-center text-lg sm:text-2xl transition-all"
                      autoFocus
                      onKeyDown={(e) => { 
                          if (e.key === 'Enter') {
                              const nameToSave = tempName.trim();
                              if (!nameToSave) return;
                              if (nameToSave.includes(' ')) {
                                  showAlert("이름에 띄어쓰기(공백)를 포함할 수 없습니다.");
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
                  className="w-full px-4 sm:px-5 py-3 sm:py-5 bg-indigo-600 text-white rounded-xl sm:rounded-2xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-black shadow-xl shadow-indigo-200 transition-all text-base sm:text-xl"
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