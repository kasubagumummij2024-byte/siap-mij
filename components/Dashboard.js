import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import NetInfo from '@react-native-community/netinfo';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Dimensions, Easing, FlatList, Image, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { db } from '../firebaseConfig';
import { syncData } from '../utils/syncService';
// --- IMPORT HELPER NOTIFIKASI ---
import { getAllOtherTokens, registerForPushNotificationsAsync, sendPushNotification } from '../utils/notificationHelper';

import ApprovalList from './ApprovalList';
import AttendanceModal from './AttendanceModal';
import ChangePasswordModal from './ChangePasswordModal';
import PermissionModal from './PermissionModal';
import ReportModal from './ReportModal';

// File System Compatibility
let FileSystem;
try { FileSystem = require('expo-file-system/legacy'); } 
catch (error) { FileSystem = require('expo-file-system'); }

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function Dashboard({ user, userData, onLogout }) {
  const [refreshing, setRefreshing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState(userData?.total_poin || 0);
  const [userStatus, setUserStatus] = useState(userData?.status || 'active'); 
  const [breakLeft, setBreakLeft] = useState(''); 
  const [reportList, setReportList] = useState([]);
  const [permitList, setPermitList] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);

  // --- STATES ---
  const [hasCheckedIn, setHasCheckedIn] = useState(false); 
  const [activeSOS, setActiveSOS] = useState(null); 
  const [passModalVisible, setPassModalVisible] = useState(false); 
  const [announcement, setAnnouncement] = useState("Selamat datang di aplikasi SIAP-MIJ Mobile."); 
  const [editAnnounceVisible, setEditAnnounceVisible] = useState(false); 
  const [tempAnnounce, setTempAnnounce] = useState("");

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('laporan');

  const [isObsolete, setIsObsolete] = useState(false);

  const soundRef = useRef(null);
  const translateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
   
  const [modalVisible, setModalVisible] = useState(false);
  const [permModalVisible, setPermModalVisible] = useState(false);
  const [attModalVisible, setAttModalVisible] = useState(false); 
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dateFrom, setDateFrom] = useState(new Date());
  const [dateTo, setDateTo] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('from');

  const isKasubag = userData?.jabatan?.includes('kasubag'); 
  const isKabag = userData?.jabatan === 'kabag_tu';
  const isCommander = userData?.jabatan === 'commander';
  const isKoordinator = userData?.jabatan === 'koordinator';
  const isManagement = userData?.divisi === 'management' || isKasubag || isKabag; 
  const isLeader = isManagement || isCommander || isKoordinator;

  const themeColor = userData?.divisi === 'security' ? '#2563eb' : 
                      userData?.divisi === 'cleaning' ? '#16a34a' : 
                      userData?.divisi === 'management' ? '#7c3aed' : '#ea580c';

  // --- 1. REGISTRASI NOTIFIKASI ---
  useEffect(() => {
    registerForPushNotificationsAsync(user.uid);
  }, []);

  // --- 2. LOGIC FORCE UPDATE ---
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "app_config", "settings"), (docSnap) => {
        if (docSnap.exists()) {
            const minVersion = docSnap.data().minVersion; 
            const currentVersion = Constants.expoConfig?.version || '1.0.0'; 
            if (compareVersion(currentVersion, minVersion) < 0) {
                setIsObsolete(true); 
            }
        }
    });
    return () => unsubscribe();
  }, []);

  const compareVersion = (v1, v2) => {
    if (!v1 || !v2) return 0;
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const val1 = v1Parts[i] || 0;
        const val2 = v2Parts[i] || 0;
        if (val1 > val2) return 1;
        if (val1 < val2) return -1;
    }
    return 0;
  };

  // --- 3. LOGIKA SUARA SIRINE ---
  useEffect(() => {
    let isCancelled = false; 
    const manageSiren = async () => {
      if (activeSOS) {
        if (activeSOS.userId === user.uid) return; 
        if (soundRef.current?._loaded) return;
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
          });
          const { sound } = await Audio.Sound.createAsync(
             require('../assets/siren.mp3'),
             { shouldPlay: true, isLooping: true, volume: 1.0 }
          );
          if (isCancelled || !activeSOS) {
             await sound.unloadAsync();
             return;
          }
          soundRef.current = sound;
        } catch (error) { console.log("Gagal memuat sirine:", error); }
      } 
      else {
        if (soundRef.current) {
          try {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
          } catch (e) { console.log("Error saat stop:", e); } 
          finally { soundRef.current = null; }
        }
      }
    };
    manageSiren();
    return () => { isCancelled = true; };
  }, [activeSOS]);

  // --- ANIMASI RUNNING TEXT ---
  useEffect(() => {
    let stopAnimation = false; 
    const startAnimation = () => {
      if (stopAnimation) return; 
      translateX.setValue(SCREEN_WIDTH); 
      const textLength = announcement ? announcement.length : 20;
      const duration = 5000 + (textLength * 200); 
      Animated.timing(translateX, {
        toValue: -SCREEN_WIDTH * 2, 
        duration: duration, 
        easing: Easing.linear, 
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !stopAnimation) { startAnimation(); }
      });
    };
    startAnimation();
    return () => { stopAnimation = true; };
  }, [announcement]); 

  // --- LISTENER PENGUMUMAN ---
  useEffect(() => {
    const docRef = doc(db, "app_config", "announcement");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().text) { setAnnouncement(docSnap.data().text); }
      }, 
      (error) => { console.error("Error Announcement:", error.message); }
    );
    return () => unsubscribe();
  }, []);

  // --- REALTIME SOS LISTENER ---
  useEffect(() => {
    const q = query(collection(db, "active_sos"), where("status", "==", "ACTIVE"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const sosData = snapshot.docs[0].data();
        sosData.id = snapshot.docs[0].id; 
        setActiveSOS(sosData);
      } else { setActiveSOS(null); }
    });
    return () => unsubscribe();
  }, []);

  // Timer Logic
  useEffect(() => {
    let interval;
    if (userStatus === 'break' && userData?.statusEndTime) {
      interval = setInterval(() => {
        const now = new Date();
        const end = userData.statusEndTime.toDate();
        const diff = end - now;
        if (diff <= 0) setBreakLeft("HABIS");
        else {
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setBreakLeft(`${minutes}m ${seconds}s`);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [userStatus, userData]);

  // --- FETCH DATA UTAMA ---
  const checkDailyAttendance = async () => {
    try {
      const now = new Date();
      const todayString = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; 
      const q = query(collection(db, "attendance"), where("userId", "==", user.uid), where("date", "==", todayString));
      const snap = await getDocs(q);
      setHasCheckedIn(!snap.empty);
    } catch (e) { setHasCheckedIn(false); }
  };

  const fetchData = async () => {
    setRefreshing(true);
    setLoadingReports(true); 
    try {
      await checkDailyAttendance(); 
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentPoints(data.total_poin);
        setUserStatus(data.status || 'active');
        userData.status = data.status;
        userData.statusEndTime = data.statusEndTime;
        userData.statusReason = data.statusReason;
        userData.replacingWho = data.replacingWho;
      }

      // --- 1. GET REPORT LIST ---
      let q;
      const reportsRef = collection(db, "reports");
      if (isManagement) {
        q = query(reportsRef, orderBy("timestamp", "desc"), limit(50));
      } else if (isCommander || isKoordinator) {
        const div = userData?.divisi || "umum";
        q = query(reportsRef, where("userDivisi", "==", div), orderBy("timestamp", "desc"), limit(20));
      } else {
        q = query(reportsRef, where("userId", "==", user.uid), orderBy("timestamp", "desc"), limit(20));
      }
      const querySnapshot = await getDocs(q);
      const reports = [];
      querySnapshot.forEach((doc) => reports.push({ id: doc.id, ...doc.data() }));
      setReportList(reports);

      // --- 2. GET PERMIT LIST (KHUSUS MANAGEMENT) ---
      if (isManagement) {
          const usersRef = collection(db, "users");
          const allUsersSnap = await getDocs(usersRef);
          const activePermits = [];
          allUsersSnap.forEach(doc => {
             const d = doc.data();
             if (d.status && d.status !== 'active') {
                 activePermits.push({id: doc.id, ...d});
             }
          });
          setPermitList(activePermits);
      }

    } catch (error) { 
      Alert.alert("Gagal Memuat Data", "Cek koneksi internet."); 
    } finally { 
      setRefreshing(false); 
      setLoadingReports(false); 
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- AUTO SYNC ---
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        syncData().then((count) => {
          if (count > 0) {
            Alert.alert("Sinkronisasi Berhasil", `${count} laporan terkirim.`);
            fetchData(); 
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // --- FILTERED DATA ---
  const getFilteredReports = () => {
      if (!searchQuery) return reportList;
      return reportList.filter(item => 
          item.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.userDivisi.toLowerCase().includes(searchQuery.toLowerCase())
      );
  };

  const getFilteredPermits = () => {
      if (!searchQuery) return permitList;
      return permitList.filter(item => 
          item.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.divisi.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.statusReason && item.statusReason.toLowerCase().includes(searchQuery.toLowerCase()))
      );
  };

  // --- HANDLERS ---
  const handleUpdateAnnouncement = async () => {
    try {
      await setDoc(doc(db, "app_config", "announcement"), {
        text: tempAnnounce, updatedBy: user.uid, updatedAt: serverTimestamp()
      }, { merge: true });
      setEditAnnounceVisible(false);
      Alert.alert("Sukses", "Pengumuman diperbarui.");
    } catch (e) { Alert.alert("Gagal", e.message); }
  };

  const handleResetPoints = async () => {
    Alert.alert("PERINGATAN", "Reset SEMUA poin anggota jadi 0?", [
      { text: "BATAL", style: "cancel" },
      { text: "YA, RESET", style: 'destructive', onPress: async () => {
          try {
            setRefreshing(true);
            const batch = writeBatch(db);
            const usersRef = collection(db, "users");
            const snapshot = await getDocs(usersRef);
            snapshot.docs.forEach((doc) => batch.update(doc.ref, { total_poin: 0 }));
            await batch.commit();
            Alert.alert("Sukses", "Poin di-reset.");
            fetchData();
          } catch (error) { Alert.alert("Error", error.message); } 
          finally { setRefreshing(false); }
        }
      }
    ]);
  };

  const handleTriggerSOS = () => {
    if (activeSOS) return;
    Alert.alert("BAHAYA", "Nyalakan sinyal SOS?", [
        { text: "Batal", style: "cancel" },
        { text: "NYALAKAN", style: 'destructive', onPress: async () => {
            try {
              // 1. Simpan ke Database
              await addDoc(collection(db, "active_sos"), {
                userId: user.uid, userName: userData?.nama || "Anggota", userDivisi: userData?.divisi || "-",
                status: "ACTIVE", createdAt: serverTimestamp(),
              });

              // 2. Kirim Notifikasi ke Semua Orang
              const tokens = await getAllOtherTokens(user.uid);
              await sendPushNotification(tokens, "SOS BAHAYA!", `${userData?.nama} mengirim sinyal SOS dari divisi ${userData?.divisi}!`);

            } catch (e) { Alert.alert("Error", e.message); }
        }}
    ]);
  };

  const handleResolveSOS = async () => {
    if (!activeSOS) return;
    const canResolve = activeSOS.userId === user.uid || isManagement;
    if (canResolve) {
      Alert.alert("Matikan Sinyal?", "Pastikan kondisi aman.", [
        { text: "Belum", style: "cancel" },
        { text: "AMAN", onPress: async () => {
            try {
              const sosRef = doc(db, "active_sos", activeSOS.id);
              await updateDoc(sosRef, { status: "RESOLVED", resolvedBy: user.uid, resolvedAt: serverTimestamp() });
              // Optional: Kirim notif aman
              const tokens = await getAllOtherTokens(user.uid);
              await sendPushNotification(tokens, "SOS SELESAI", "Kondisi dinyatakan aman.");
            } catch (e) { Alert.alert("Error", e.message); }
        }}
      ]);
    } else { Alert.alert("Akses Ditolak", "Anda tidak berhak mematikan SOS ini."); }
  };

  const handleProtectedPress = (type) => {
    if (!hasCheckedIn) {
      Alert.alert("Belum Absen", "Silakan Absen Masuk dulu.", [{ text: "OK", onPress: () => setAttModalVisible(true) }]);
      return;
    }
    if (type === 'laporan') setModalVisible(true);
    if (type === 'izin') setPermModalVisible(true);
  };

  const onDateChange = (event, selectedDate) => {
    setShowPicker(false);
    if (selectedDate) pickerMode === 'from' ? setDateFrom(selectedDate) : setDateTo(selectedDate);
  };

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      const startDate = new Date(dateFrom); startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateTo); endDate.setHours(23, 59, 59, 999);
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const qRep = query(collection(db, "reports"), where("timestamp", ">=", startDate), where("timestamp", "<=", endDate), orderBy("timestamp", "desc"));
      const reportsSnap = await getDocs(qRep);
      if (reportsSnap.empty) { Alert.alert("Kosong", "Tidak ada data."); setDownloading(false); return; }

      const qAtt = query(collection(db, "attendance"), where("date", ">=", startStr), where("date", "<=", endStr));
      const attSnap = await getDocs(qAtt);
      const attendanceMap = {};
      attSnap.forEach(doc => {
        const d = doc.data();
        attendanceMap[`${d.userId}_${d.date}`] = `${d.status} ${d.shift !== 'Non-Shift' ? '('+d.shift+')' : ''}`.trim();
      });

      let csvContent = "Tanggal;Jam;Nama;Divisi;Status Absensi;Lokasi;Keterangan;Foto\n";
      reportsSnap.forEach((doc) => {
        const data = doc.data();
        const d = data.timestamp ? data.timestamp.toDate() : new Date();
        const dateOnlyStr = d.toISOString().split('T')[0];
        const absensiStatus = attendanceMap[`${data.userId}_${dateOnlyStr}`] || "Belum Absen";
        const desc = data.description ? data.description.replace(/;/g, ",").replace(/\n/g, " ") : "-";
        csvContent += `${d.toLocaleDateString()};${d.toLocaleTimeString()};${data.userName};${data.userDivisi};${absensiStatus};${data.locationName};${desc};${data.photoUrl}\n`;
      });

      const filename = FileSystem.documentDirectory + "Rekap.csv";
      await FileSystem.writeAsStringAsync(filename, csvContent, { encoding: 'utf8' });
      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(filename); setShowDownloadModal(false); }
    } catch (error) { Alert.alert("Error", error.message); } 
    finally { setDownloading(false); }
  };

  const handleEndStatus = async () => {
    Alert.alert("Selesai?", "Kembali bertugas?", [
      { text: "Batal", style: "cancel" },
      { text: "YA", onPress: async () => {
          await updateDoc(doc(db, "users", user.uid), { status: 'active', statusReason: null, statusEndTime: null, replacingWho: null });
          setUserStatus('active'); fetchData();
      }}
    ]);
  };

  const formatTime = (ts) => ts ? ts.toDate().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : "-";
   
  const renderReportItem = ({ item }) => (
    <View style={styles.cardReport}>
      <Image source={{ uri: item.photoUrl }} style={styles.cardImage} />
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}><Text style={styles.cardLocation}>{item.locationName}</Text><Text style={styles.cardTime}>{formatTime(item.timestamp)}</Text></View>
        {isLeader && <Text style={styles.reporterName}>👤 {item.userName}</Text>}
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      </View>
    </View>
  );

  const renderPermitItem = ({ item }) => (
    <View style={[styles.cardReport, {backgroundColor: '#fef2f2', borderLeftWidth:4, borderLeftColor:'#ef4444'}]}>
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
            <Text style={[styles.cardLocation, {color:'#dc2626'}]}>
                {item.status === 'break' ? '☕ ISTIRAHAT' : item.status === 'permit' ? '🚪 IZIN KELUAR' : item.status === 'pending' ? '⏳ MENUNGGU ACC' : '🔄 MENGGANTIKAN'}
            </Text>
            {item.statusEndTime && (
                <Text style={{fontSize:12, fontWeight:'bold', color:'#dc2626'}}>
                   S.d. {new Date(item.statusEndTime.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </Text>
            )}
        </View>
        <Text style={styles.reporterName}>👤 {item.nama}</Text>
        <Text style={{fontSize:12, color:'#64748b', fontStyle:'italic', marginTop:2}}>"{item.statusReason || item.requestReason}"</Text>
        <Text style={{fontSize:10, color:'#94a3b8', marginTop:5}}>Divisi: {item.divisi?.toUpperCase()}</Text>
      </View>
    </View>
  );

  const renderStatusCard = () => {
    if (userStatus === 'pending') return <View style={[styles.statusCard, {backgroundColor: '#f59e0b'}]}><Text style={styles.statusTitle}>⏳ MENUNGGU ACC</Text></View>;
    if (userStatus === 'replacing') return <View style={[styles.statusCard, {backgroundColor: '#7c3aed'}]}><Text style={styles.statusTitle}>👮‍♂️ MENGGANTIKAN {userData?.replacingWho}</Text><TouchableOpacity style={styles.finishBtnWhite} onPress={handleEndStatus}><Text style={{fontWeight:'bold', color:'#7c3aed'}}>SELESAI</Text></TouchableOpacity></View>;
    if (userStatus === 'break' || userStatus === 'permit') return <View style={[styles.statusCard, {backgroundColor: userStatus === 'break' ? '#3b82f6' : '#ef4444'}]}><Text style={styles.statusTitle}>{userStatus === 'break' ? "ISTIRAHAT" : "IZIN"}</Text>{userStatus==='break'?<Text style={styles.timerText}>{breakLeft}</Text>:<Text style={{color:'white',marginTop:10}}>{userData?.statusReason}</Text>}<TouchableOpacity style={styles.finishBtnWhite} onPress={handleEndStatus}><Text style={{fontWeight:'bold', color:userStatus==='break'?'#3b82f6':'#ef4444'}}>KEMBALI</Text></TouchableOpacity></View>;
    return null;
  };

  const renderSOSBanner = () => {
    if (!activeSOS) return null;
    return (
      <View style={styles.sosBanner}>
        <View style={styles.sosHeader}>
          <Ionicons name="warning" size={32} color="white" /><Text style={styles.sosTitle}>SINYAL BAHAYA AKTIF</Text><Ionicons name="warning" size={32} color="white" />
        </View>
        <Text style={styles.sosText}>Pelapor: {activeSOS.userName}</Text>
        <Text style={styles.sosText}>Divisi: {activeSOS.userDivisi}</Text>
        {(activeSOS.userId === user.uid || isManagement) && (
          <TouchableOpacity style={styles.sosResolveBtn} onPress={handleResolveSOS}>
            <Text style={{color: '#dc2626', fontWeight: 'bold'}}>MATIKAN SINYAL / AMAN</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (isObsolete) {
    return (
        <View style={{flex:1, backgroundColor:'black', justifyContent:'center', alignItems:'center', padding:30}}>
            <Ionicons name="alert-circle" size={80} color="#ef4444" />
            <Text style={{color:'white', fontSize:24, fontWeight:'bold', marginTop:20, textAlign:'center'}}>
                UPDATE DIPERLUKAN
            </Text>
            <Text style={{color:'#94a3b8', fontSize:16, textAlign:'center', marginTop:10, marginBottom:30}}>
                Versi aplikasi ini ({Constants.expoConfig?.version}) sudah usang. Mohon install versi terbaru.
            </Text>
            <TouchableOpacity 
                onPress={() => BackHandler.exitApp()} 
                style={{backgroundColor:'#ef4444', padding:15, borderRadius:10, width:'100%', alignItems:'center'}}>
                <Text style={{color:'white', fontWeight:'bold'}}>KELUAR APLIKASI</Text>
            </TouchableOpacity>
        </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.marqueeContainer} 
        onPress={() => {
          if (isKasubag) {
            setTempAnnounce(announcement); 
            setEditAnnounceVisible(true);
          }
        }}
        activeOpacity={isKasubag ? 0.7 : 1}
      >
         <Animated.View style={{ transform: [{ translateX }], width: '1000%' }}>
            <Text key={announcement} style={styles.marqueeText}>
              📢 {announcement}
            </Text>
         </Animated.View>
         {isKasubag && <View style={styles.editBadge}><Ionicons name="pencil" size={12} color="white"/></View>}
      </TouchableOpacity>

      <View style={[styles.header, { backgroundColor: themeColor }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerLogoContainer}>
            <Image source={require('../assets/logo-mij.png')} style={styles.headerLogo} />
            <View>
              <Text style={styles.welcomeText}>Selamat Bertugas,</Text>
              <Text style={styles.nameText}>{userData?.nama}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{userData?.divisi?.toUpperCase()} • {userData?.jabatan?.toUpperCase()}</Text>
              </View>
            </View>
          </View>

          <View style={{flexDirection: 'row'}}>
             <TouchableOpacity onPress={() => setPassModalVisible(true)} style={[styles.logoutBtn, {marginRight: 10, backgroundColor: 'rgba(255,255,255,0.2)'}]}>
               <Ionicons name="key-outline" size={24} color="white" />
             </TouchableOpacity>
             <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}><Ionicons name="log-out-outline" size={24} color="white" /></TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.scoreCard}><View><Text style={styles.scoreLabel}>Poin</Text><Text style={styles.scoreValue}>{currentPoints}</Text></View><Ionicons name="trophy" size={40} color="#f59e0b" /></View>
      </View>
      
      <View style={styles.body}>
        {renderSOSBanner()}
        {isLeader && <ApprovalList commanderData={userData} commanderUid={user.uid} />}
        {userStatus !== 'active' && renderStatusCard()}

        {(userStatus === 'active' || userStatus === 'replacing') && (
          <View style={styles.menuGrid}>
            <TouchableOpacity style={styles.mainButton} onPress={() => setAttModalVisible(true)}>
              <View style={[styles.iconCircle, { backgroundColor: '#dcfce7' }]}><Ionicons name="finger-print" size={28} color="#16a34a" /></View>
              <Text style={styles.btnTitle}>Absen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.mainButton, { opacity: hasCheckedIn ? 1 : 0.5 }]} onPress={() => handleProtectedPress('laporan')}>
              <View style={[styles.iconCircle, { backgroundColor: hasCheckedIn ? '#e0f2fe' : '#f1f5f9' }]}><Ionicons name="camera" size={28} color={hasCheckedIn ? "#0284c7" : "#94a3b8"} /></View>
              <Text style={[styles.btnTitle, { color: hasCheckedIn ? '#334155' : '#94a3b8' }]}>Lapor</Text>
            </TouchableOpacity>

            {userStatus === 'active' && !isKabag && (
              <TouchableOpacity style={[styles.mainButton, { opacity: hasCheckedIn ? 1 : 0.5 }]} onPress={() => handleProtectedPress('izin')}>
                <View style={[styles.iconCircle, { backgroundColor: hasCheckedIn ? '#f3e8ff' : '#f1f5f9' }]}>
                  <Ionicons name="time" size={28} color={hasCheckedIn ? "#9333ea" : "#94a3b8"} />
                </View>
                <Text style={[styles.btnTitle, { color: hasCheckedIn ? '#334155' : '#94a3b8' }]}>Izin</Text>
              </TouchableOpacity>
            )}

            {isManagement ? (
              <>
                <TouchableOpacity style={styles.mainButton} onPress={() => setShowDownloadModal(true)}>
                  <View style={[styles.iconCircle, { backgroundColor: '#ffedd5' }]}><Ionicons name="download" size={28} color="#ea580c" /></View>
                  <Text style={[styles.btnTitle, {color:'#ea580c'}]}>Rekap</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mainButton} onPress={handleResetPoints}>
                  <View style={[styles.iconCircle, { backgroundColor: '#fee2e2' }]}><Ionicons name="trash-bin" size={28} color="#dc2626" /></View>
                  <Text style={[styles.btnTitle, {color:'#dc2626'}]}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mainButton} onPress={handleTriggerSOS} disabled={activeSOS !== null}>
                  <View style={[styles.iconCircle, { backgroundColor: activeSOS ? '#e2e8f0' : '#fee2e2' }]}><Ionicons name="alert-circle" size={28} color={activeSOS ? "#94a3b8" : "#dc2626"} /></View>
                  <Text style={[styles.btnTitle, {color: activeSOS ? "#94a3b8" : "#dc2626"}]}>SOS</Text>
                </TouchableOpacity>
              </>
            ) : (
               <TouchableOpacity style={styles.mainButton} onPress={handleTriggerSOS} disabled={activeSOS !== null}>
                 <View style={[styles.iconCircle, { backgroundColor: activeSOS ? '#e2e8f0' : '#fee2e2' }]}><Ionicons name="alert-circle" size={28} color={activeSOS ? "#94a3b8" : "#dc2626"} /></View>
                 <Text style={[styles.btnTitle, {color: activeSOS ? "#94a3b8" : "#dc2626"}]}>SOS</Text>
               </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#94a3b8" style={{marginRight:8}} />
            <TextInput 
                placeholder="Cari nama, divisi, atau laporan..." 
                value={searchQuery} 
                onChangeText={setSearchQuery} 
                style={{flex:1, color:'#1e293b'}}
            />
            {searchQuery.length > 0 && (
                <TouchableOpacity onPress={()=>setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color="#94a3b8" />
                </TouchableOpacity>
            )}
        </View>

        {isManagement ? (
            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'laporan' && styles.tabBtnActive]} onPress={()=>setActiveTab('laporan')}>
                    <Text style={[styles.tabText, activeTab === 'laporan' && styles.tabTextActive]}>📋 Laporan</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'pantauan' && styles.tabBtnActive]} onPress={()=>setActiveTab('pantauan')}>
                    <Text style={[styles.tabText, activeTab === 'pantauan' && styles.tabTextActive]}>🚧 Pantauan Izin ({getFilteredPermits().length})</Text>
                </TouchableOpacity>
            </View>
        ) : (
            <Text style={styles.sectionTitle}>{isLeader ? "Laporan Divisi Anda" : "Riwayat Laporan"}</Text>
        )}
        
        {loadingReports ? <ActivityIndicator size="large" color={themeColor} /> : (
            (activeTab === 'laporan' || !isManagement) ? (
                <FlatList 
                    data={getFilteredReports()} 
                    renderItem={renderReportItem} 
                    keyExtractor={item => item.id} 
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} />} 
                    contentContainerStyle={{paddingBottom:100}} 
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'#94a3b8'}}>Data tidak ditemukan.</Text>}
                />
            ) : (
                <FlatList 
                    data={getFilteredPermits()} 
                    renderItem={renderPermitItem} 
                    keyExtractor={item => item.id} 
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} />} 
                    contentContainerStyle={{paddingBottom:100}} 
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'#16a34a', fontWeight:'bold'}}>Semua personil Standby (Aman).</Text>}
                />
            )
        )}
      </View>

      <ChangePasswordModal visible={passModalVisible} onClose={() => setPassModalVisible(false)} user={user} />
      <Modal visible={editAnnounceVisible} transparent={true} animationType="fade" onRequestClose={() => setEditAnnounceVisible(false)}><View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>📢 Update Info</Text><TextInput style={{borderWidth:1, borderColor:'#ccc', borderRadius:10, padding:10, marginBottom:20, minHeight:60, color:'black'}} multiline value={tempAnnounce} onChangeText={setTempAnnounce}/><View style={styles.modalFooter}><TouchableOpacity onPress={()=>setEditAnnounceVisible(false)} style={{padding:10}}><Text style={{color:'red'}}>Batal</Text></TouchableOpacity><TouchableOpacity onPress={handleUpdateAnnouncement} style={{backgroundColor:'blue', padding:10, borderRadius:8}}><Text style={{color:'white'}}>Update</Text></TouchableOpacity></View></View></View></Modal>
      <Modal visible={showDownloadModal} transparent={true} animationType="fade" onRequestClose={()=>setShowDownloadModal(false)}><View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>Download</Text><TouchableOpacity style={styles.dateBtn} onPress={()=>{setPickerMode('from');setShowPicker(true);}}><Text>Dari: {dateFrom.toLocaleDateString()}</Text></TouchableOpacity><TouchableOpacity style={[styles.dateBtn,{marginTop:10}]} onPress={()=>{setPickerMode('to');setShowPicker(true);}}><Text>Sampai: {dateTo.toLocaleDateString()}</Text></TouchableOpacity><View style={styles.modalFooter}><TouchableOpacity onPress={()=>setShowDownloadModal(false)} style={{padding:10}}><Text style={{color:'red'}}>Batal</Text></TouchableOpacity><TouchableOpacity onPress={handleDownloadExcel} style={{backgroundColor:'green', padding:10, borderRadius:8}}><Text style={{color:'white'}}>Download</Text></TouchableOpacity></View>{showPicker && <DateTimePicker value={pickerMode==='from'?dateFrom:dateTo} mode="date" display="default" onChange={onDateChange}/>}</View></View></Modal>
      <ReportModal visible={modalVisible} onClose={()=>setModalVisible(false)} user={user} userData={userData} onSuccess={()=>{setModalVisible(false);fetchData();}} />
      <PermissionModal visible={permModalVisible} onClose={()=>setPermModalVisible(false)} user={user} userData={userData} onSuccess={()=>{setPermModalVisible(false);fetchData();}} />
      <AttendanceModal visible={attModalVisible} onClose={()=>setAttModalVisible(false)} user={user} userData={userData} onSuccess={()=>{fetchData();}} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, paddingTop: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingBottom: 60, elevation: 5 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'flex-start' }, 
  headerLogoContainer: { flexDirection: 'row', alignItems: 'center', flex: 1 }, 
  headerLogo: { width: 50, height: 50, resizeMode: 'contain', marginRight: 12 },
  welcomeText: { color: '#e2e8f0', fontSize: 12 },
  nameText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginTop: 4 },
  roleText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: 'rgba(255,0,0,0.3)', padding: 8, borderRadius: 8 },
  scoreCard: { position: 'absolute', bottom: -30, left: 20, right: 20, backgroundColor: 'white', borderRadius: 15, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
  scoreLabel: { color: '#64748b', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  scoreValue: { color: '#1e293b', fontSize: 28, fontWeight: '900' },
  marqueeContainer: { marginTop: 0, paddingTop: 40, paddingBottom: 10, backgroundColor: '#fff7ed', overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: '#fed7aa' },
  marqueeText: { fontSize: 14, color: '#c2410c', fontWeight: 'bold' },
  editBadge: { position: 'absolute', right: 10, top: 40, backgroundColor: '#ea580c', padding: 4, borderRadius: 4, zIndex:10 },
  body: { flex: 1, marginTop: 40, paddingHorizontal: 20 },
  menuGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap' },
  mainButton: { backgroundColor: 'white', width: '23%', padding: 8, borderRadius: 12, alignItems: 'center', elevation: 2, marginBottom: 15 },
  iconCircle: { width: 40, height: 40, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  btnTitle: { fontSize: 10, fontWeight: 'bold', color: '#334155' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 10 },
  cardReport: { backgroundColor: 'white', borderRadius: 12, marginBottom: 12, flexDirection: 'row', padding: 10, elevation: 2 },
  cardImage: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#cbd5e1' },
  cardContent: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardLocation: { fontSize: 13, fontWeight: 'bold', color: '#1e293b', flex: 1 },
  cardTime: { fontSize: 10, color: '#64748b' },
  reporterName: { fontSize: 11, color: '#2563eb', fontWeight: '600', marginBottom: 2 },
  cardDesc: { fontSize: 12, color: '#475569', lineHeight: 16 },
  statusCard: { padding: 20, borderRadius: 15, marginBottom: 20, alignItems: 'center', elevation: 3 },
  statusTitle: { color: 'white', fontWeight: 'bold', fontSize: 18, marginBottom: 5 },
  timerText: { fontSize: 40, fontWeight: '900', color: 'white', marginVertical: 10 },
  finishBtnWhite: { backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 15, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#1e293b' },
  dateBtn: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, alignItems: 'center' },
  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  sosBanner: { backgroundColor: '#ef4444', borderRadius: 15, padding: 15, marginBottom: 20, alignItems: 'center', elevation: 5 },
  sosHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'center', gap: 10 },
  sosTitle: { color: 'white', fontSize: 18, fontWeight: '900' },
  sosText: { color: 'white', fontSize: 14, marginBottom: 2 },
  sosResolveBtn: { backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, marginTop: 15, width: '100%', alignItems: 'center' },
   
  // STYLE BARU UNTUK PENCARIAN & TAB
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 15, elevation: 2 },
  tabContainer: { flexDirection: 'row', marginBottom: 15 },
  tabBtn: { flex: 1, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: '#e2e8f0', alignItems: 'center' },
  tabBtnActive: { borderBottomColor: '#2563eb' },
  tabText: { color: '#94a3b8', fontWeight: 'bold' },
  tabTextActive: { color: '#2563eb', fontWeight: 'bold' },
});