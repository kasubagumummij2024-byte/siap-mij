import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, RefreshControl, ActivityIndicator, FlatList, Image, Modal, Animated, Easing, Dimensions, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; 
import { doc, getDoc, collection, query, where, orderBy, getDocs, limit, updateDoc, onSnapshot, addDoc, serverTimestamp, writeBatch, setDoc } from 'firebase/firestore'; 
import * as Sharing from 'expo-sharing';       
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { Audio } from 'expo-av'; // <--- IMPORT LIBRARY AUDIO
import { db, auth } from '../firebaseConfig'; 
import ReportModal from './ReportModal'; 
import PermissionModal from './PermissionModal'; 
import ApprovalList from './ApprovalList';
import AttendanceModal from './AttendanceModal'; 
import ChangePasswordModal from './ChangePasswordModal'; 

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
  const [loadingReports, setLoadingReports] = useState(true);

  // --- STATES ---
  const [hasCheckedIn, setHasCheckedIn] = useState(false); 
  const [activeSOS, setActiveSOS] = useState(null); 
  
  const [passModalVisible, setPassModalVisible] = useState(false); 
  const [announcement, setAnnouncement] = useState("Selamat datang di aplikasi SIAP-MIJ Mobile."); 
  const [editAnnounceVisible, setEditAnnounceVisible] = useState(false); 
  const [tempAnnounce, setTempAnnounce] = useState("");

  // REF UNTUK SUARA SIRINE
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

  const isKasubag = userData?.jabatan === 'kasubag';
  const isCommander = ['commander', 'koordinator'].includes(userData?.jabatan);

  const themeColor = userData?.divisi === 'security' ? '#2563eb' : 
                     userData?.divisi === 'cleaning' ? '#16a34a' : 
                     userData?.divisi === 'management' ? '#7c3aed' : '#ea580c';

  // --- LOGIKA SUARA SIRINE (REVISI: ANTI-MACET) ---
  useEffect(() => {
    let isCancelled = false; // Penanda untuk mencegah race condition

    const manageSiren = async () => {
      // 1. JIKA SOS AKTIF (NYALAKAN)
      if (activeSOS) {
        // Cek: Jika suara sudah ada/sedang jalan, jangan buat baru (mencegah glitch/double sound)
        if (soundRef.current?._loaded) return;

        try {
          // Setup mode agar bunyi walau di-silent
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
          });

          // Mulai load file
          const { sound } = await Audio.Sound.createAsync(
             require('../assets/siren.mp3'),
             { shouldPlay: true, isLooping: true, volume: 1.0 }
          );

          // PENTING: Cek apakah saat loading selesai, user keburu mematikan SOS?
          if (isCancelled || !activeSOS) {
             console.log("SOS dibatalkan saat loading, unload suara.");
             await sound.unloadAsync();
             return;
          }

          soundRef.current = sound;
        } catch (error) {
           console.log("Gagal memuat sirine:", error);
        }
      } 
      // 2. JIKA SOS MATI (HENTIKAN)
      else {
        if (soundRef.current) {
          try {
            console.log("Mematikan Sirine...");
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
          } catch (e) {
            console.log("Error saat stop:", e);
          } finally {
            soundRef.current = null; // Pastikan ref kosong
          }
        }
      }
    };

    manageSiren();

    // Cleanup saat component unmount atau activeSOS berubah
    return () => {
      isCancelled = true;
      // Kita tidak unload di sini secara paksa agar suara tidak putus-nyambung (glitch)
      // saat ada update data Firestore. Biarkan logika 'else' di atas yang mengurus stop.
      // Kecuali jika component benar-benar unmount (User logout/tutup aplikasi).
    };
  }, [activeSOS]);

  // --- ANIMASI RUNNING TEXT (REVISI: AUTO-RESET) ---
  useEffect(() => {
    // 1. Reset posisi ke kanan layar setiap kali teks berubah
    translateX.setValue(SCREEN_WIDTH); 

    let currentAnimation = null;

    const startAnimation = () => {
      // Hitung durasi berdasarkan panjang teks agar kecepatan stabil
      // (Teks panjang = jalan lebih lama, Teks pendek = jalan standar)
      const duration = (announcement.length * 150) + 8000; 

      currentAnimation = Animated.timing(translateX, {
        toValue: -SCREEN_WIDTH * 2, // Bergerak sampai hilang di kiri
        duration: duration,
        easing: Easing.linear,
        useNativeDriver: true,
      });

      currentAnimation.start(({ finished }) => {
        if (finished) {
          startAnimation(); // Ulangi loop
        }
      });
    };

    startAnimation();

    // Cleanup: Hentikan animasi lama jika teks berubah
    return () => {
      if (currentAnimation) currentAnimation.stop();
    };
  }, [announcement]); // <--- Penting: Efek ini jalan ulang saat 'announcement' berubah

  // --- LISTENER PENGUMUMAN (DEBUG MODE) ---
  useEffect(() => {
    console.log("🔥 START: Menghubungkan ke app_config/announcement...");
    const docRef = doc(db, "app_config", "announcement");
    
    const unsubscribe = onSnapshot(docRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log("✅ DATA DITERIMA:", data.text); // Cek log ini di terminal
          if(data.text) {
            setAnnouncement(data.text);
          }
        } else {
          console.log("⚠️ DOKUMEN TIDAK DITEMUKAN! Pastikan ID dokumen di database adalah 'announcement' (huruf kecil semua).");
          // Fallback agar tidak kosong melompong
          setAnnouncement("Selamat Datang (Mode Offline/Default)");
        }
      }, 
      (error) => {
        // Ini akan menangkap jika masalahnya adalah Rules/Permission
        console.error("❌ ERROR PERMISSION/KONEKSI:", error.message);
        Alert.alert("Gagal Memuat Pengumuman", error.message);
      }
    );
    return () => unsubscribe();
  }, []);

  // --- UPDATE PENGUMUMAN (KASUBAG) ---
  const handleUpdateAnnouncement = async () => {
    try {
      await setDoc(doc(db, "app_config", "announcement"), {
        text: tempAnnounce,
        updatedBy: user.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setEditAnnounceVisible(false);
      Alert.alert("Sukses", "Pengumuman diperbarui.");
    } catch (e) { Alert.alert("Gagal", e.message); }
  };

  // --- REALTIME SOS LISTENER ---
  useEffect(() => {
    const q = query(collection(db, "active_sos"), where("status", "==", "ACTIVE"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const sosData = snapshot.docs[0].data();
        sosData.id = snapshot.docs[0].id; 
        setActiveSOS(sosData);
      } else {
        setActiveSOS(null);
      }
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
        if (diff <= 0) setBreakLeft("WAKTU HABIS");
        else {
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setBreakLeft(`${minutes}m ${seconds}s`);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [userStatus, userData]);

  // --- REVISI FINAL: SESUAI STRUKTUR DATABASE (FIXED) ---
  const checkDailyAttendance = async () => {
    try {
      // 1. Ambil tanggal hari ini format YYYY-MM-DD (Sesuai database "2025-12-18")
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayString = `${year}-${month}-${day}`; 

      console.log(`🔍 Mencek database attendance untuk: UserID=${user.uid}, Date=${todayString}`);

      // 2. Query Database
      // HAPUS where("type", "==", "check-in") karena field type tidak ada!
      // Cukup cari dokumen milik user ini di tanggal ini.
      const q = query(
        collection(db, "attendance"),
        where("userId", "==", user.uid),
        where("date", "==", todayString)
      );
      
      const snap = await getDocs(q);
      
      // 3. Cek Hasil
      // Jika ada dokumennya, berarti sudah absen.
      const isPresent = !snap.empty;

      if (isPresent) {
         const data = snap.docs[0].data();
         console.log(`✅ Absen Ditemukan! Status: ${data.status}`);
      } else {
         console.log("❌ Belum ada data absen hari ini.");
      }

      setHasCheckedIn(isPresent);

    } catch (e) { 
      console.log("Error checking attendance", e); 
      setHasCheckedIn(false);
    }
  };

  // --- FETCH DATA UTAMA ---
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
      let q;
      const reportsRef = collection(db, "reports");
      if (isKasubag) {
        q = query(reportsRef, orderBy("timestamp", "desc"), limit(20));
      } else if (isCommander) {
        const div = userData?.divisi || "umum";
        q = query(reportsRef, where("userDivisi", "==", div), orderBy("timestamp", "desc"), limit(20));
      } else {
        q = query(reportsRef, where("userId", "==", user.uid), orderBy("timestamp", "desc"), limit(20));
      }
      const querySnapshot = await getDocs(q);
      const reports = [];
      querySnapshot.forEach((doc) => reports.push({ id: doc.id, ...doc.data() }));
      setReportList(reports);
    } catch (error) { 
      console.error("ERROR FETCH DATA:", error);
      Alert.alert("Gagal Memuat Data", "Terjadi gangguan saat mengambil data. Pastikan koneksi internet lancar."); 
    } finally { 
      setRefreshing(false); 
      setLoadingReports(false); 
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- LOGIC RESET POIN (KASUBAG) ---
  const handleResetPoints = async () => {
    Alert.alert(
      "⚠️ PERINGATAN KERAS",
      "Apakah Anda yakin ingin MERESET POIN SEMUA ANGGOTA menjadi 0? Tindakan ini tidak dapat dibatalkan!",
      [
        { text: "BATAL", style: "cancel" },
        { 
          text: "YA, RESET SEMUA", 
          style: 'destructive',
          onPress: async () => {
            try {
              setRefreshing(true);
              const batch = writeBatch(db);
              const usersRef = collection(db, "users");
              const snapshot = await getDocs(usersRef);
              snapshot.docs.forEach((doc) => {
                batch.update(doc.ref, { total_poin: 0 });
              });
              await batch.commit();
              Alert.alert("Sukses", "Poin seluruh anggota telah di-reset menjadi 0.");
              fetchData();
            } catch (error) { Alert.alert("Error", error.message); } 
            finally { setRefreshing(false); }
          }
        }
      ]
    );
  };

  // --- SOS LOGIC ---
  const handleTriggerSOS = () => {
    if (activeSOS) {
      Alert.alert("SOS Sedang Aktif", `Sinyal SOS sedang menyala oleh ${activeSOS.userName}`);
      return;
    }
    Alert.alert("KONFIRMASI BAHAYA", "Nyalakan sinyal SOS ke semua unit?", [
        { text: "Batal", style: "cancel" },
        { text: "YA, NYALAKAN", style: 'destructive', onPress: async () => {
            try {
              await addDoc(collection(db, "active_sos"), {
                userId: user.uid, userName: userData?.nama || "Anggota", userDivisi: userData?.divisi || "-",
                status: "ACTIVE", createdAt: serverTimestamp(),
              });
              Alert.alert("SOS TERKIRIM", "Semua unit akan menerima alarm bahaya.");
            } catch (e) { Alert.alert("Error", e.message); }
        }}
    ]);
  };

  const handleResolveSOS = async () => {
    if (!activeSOS) return;
    const isOwner = activeSOS.userId === user.uid;
    if (isOwner || isKasubag) {
      Alert.alert("Matikan Sinyal?", "Pastikan kondisi sudah aman. Suara sirine akan dimatikan di semua unit.", [
        { text: "Belum", style: "cancel" },
        { text: "SUDAH AMAN", onPress: async () => {
            try {
              const sosRef = doc(db, "active_sos", activeSOS.id);
              await updateDoc(sosRef, { status: "RESOLVED", resolvedBy: user.uid, resolvedAt: serverTimestamp() });
              Alert.alert("Info", "Status SOS telah dimatikan.");
            } catch (e) { Alert.alert("Error", e.message); }
        }}
      ]);
    } else { Alert.alert("Akses Ditolak", "Hanya Kasubag atau pelapor yang bisa mematikan SOS."); }
  };

  const handleProtectedPress = (type) => {
    if (!hasCheckedIn) {
      Alert.alert("Belum Absen", "Silakan Absen Masuk terlebih dahulu.", [{ text: "OK", onPress: () => setAttModalVisible(true) }]);
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
      if (reportsSnap.empty) { Alert.alert("Kosong", "Tidak ada data laporan."); setDownloading(false); return; }

      const qAtt = query(collection(db, "attendance"), where("date", ">=", startStr), where("date", "<=", endStr));
      const attSnap = await getDocs(qAtt);
      const attendanceMap = {};
      attSnap.forEach(doc => {
        const d = doc.data();
        const key = `${d.userId}_${d.date}`;
        const shiftInfo = (d.shift && d.shift !== 'Non-Shift') ? `(${d.shift})` : '';
        attendanceMap[key] = `${d.status} ${shiftInfo}`.trim();
      });

      let csvContent = "Tanggal;Jam;Nama;Divisi;Status Absensi;Lokasi;Keterangan;Foto\n";
      reportsSnap.forEach((doc) => {
        const data = doc.data();
        const d = data.timestamp ? data.timestamp.toDate() : new Date();
        const dateOnlyStr = d.toISOString().split('T')[0];
        const lookupKey = `${data.userId}_${dateOnlyStr}`;
        const absensiStatus = attendanceMap[lookupKey] || "Belum Absen";
        const desc = data.description ? data.description.replace(/;/g, ",").replace(/\n/g, " ") : "-";
        csvContent += `${d.toLocaleDateString()};${d.toLocaleTimeString()};${data.userName};${data.userDivisi};${absensiStatus};${data.locationName};${desc};${data.photoUrl}\n`;
      });

      const filename = FileSystem.documentDirectory + "Rekap_Lengkap.csv";
      await FileSystem.writeAsStringAsync(filename, csvContent, { encoding: 'utf8' });
      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(filename); setShowDownloadModal(false); }
      else { Alert.alert("Gagal", "Tidak bisa share."); }
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
        {(isKasubag || isCommander) && <Text style={styles.reporterName}>👤 {item.userName}</Text>}
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
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
          {/* Tambahkan animasi berkedip jika mau, untuk sekarang ikon statis */}
          <Ionicons name="warning" size={32} color="white" /><Text style={styles.sosTitle}>SINYAL BAHAYA AKTIF</Text><Ionicons name="warning" size={32} color="white" />
        </View>
        <Text style={styles.sosText}>Pelapor: {activeSOS.userName}</Text>
        <Text style={styles.sosText}>Divisi: {activeSOS.userDivisi}</Text>
        {(activeSOS.userId === user.uid || isKasubag) && (
          <TouchableOpacity style={styles.sosResolveBtn} onPress={handleResolveSOS}>
            <Text style={{color: '#dc2626', fontWeight: 'bold'}}>MATIKAN SINYAL / AMAN</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* --- REVISI: PRE-FILL DATA SAAT KLIK --- */}
      <TouchableOpacity 
        style={styles.marqueeContainer} 
        onPress={() => {
          if (isKasubag) {
            setTempAnnounce(announcement); // <--- INI KUNCINYA: Isi dulu variabel edit dengan teks sekarang
            setEditAnnounceVisible(true);
          }
        }}
        activeOpacity={isKasubag ? 0.7 : 1}
      >
         <Animated.View style={{ transform: [{ translateX }], width: '1000%' }}>
            {/* KEY adalah rahasianya: Memaksa render ulang saat isi berubah */}
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
        {isCommander && <ApprovalList commanderData={userData} commanderUid={user.uid} />}
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

            {userStatus === 'active' && (
              <TouchableOpacity style={[styles.mainButton, { opacity: hasCheckedIn ? 1 : 0.5 }]} onPress={() => handleProtectedPress('izin')}>
                <View style={[styles.iconCircle, { backgroundColor: hasCheckedIn ? '#f3e8ff' : '#f1f5f9' }]}><Ionicons name="time" size={28} color={hasCheckedIn ? "#9333ea" : "#94a3b8"} /></View>
                <Text style={[styles.btnTitle, { color: hasCheckedIn ? '#334155' : '#94a3b8' }]}>Izin</Text>
              </TouchableOpacity>
            )}

            {isKasubag ? (
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

        <Text style={styles.sectionTitle}>{isKasubag ? "Semua Laporan" : isCommander ? "Laporan Divisi Anda" : "Riwayat Laporan"}</Text>
        {loadingReports ? <ActivityIndicator size="large" color={themeColor} /> : (
          <FlatList data={reportList} renderItem={renderReportItem} keyExtractor={item => item.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} />} contentContainerStyle={{paddingBottom:100}} ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'#94a3b8'}}>Belum ada data.</Text>}/>
        )}
      </View>

      <ChangePasswordModal visible={passModalVisible} onClose={() => setPassModalVisible(false)} user={user} />
      
      {/* --- REVISI: MODAL INPUT LEBIH STABIL --- */}
      <Modal visible={editAnnounceVisible} transparent={true} animationType="fade" onRequestClose={() => setEditAnnounceVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
             <Text style={styles.modalTitle}>📢 Update Info Berjalan</Text>
             <TextInput 
               style={{borderWidth:1, borderColor:'#ccc', borderRadius:10, padding:10, marginBottom:20, minHeight:60, color: 'black'}}
               multiline
               placeholder="Tulis pengumuman di sini..."
               value={tempAnnounce} // <--- GANTI defaultValue JADI value
               onChangeText={setTempAnnounce}
             />
             <View style={styles.modalFooter}>
               <TouchableOpacity onPress={() => setEditAnnounceVisible(false)} style={{padding:10}}><Text style={{color:'red'}}>Batal</Text></TouchableOpacity>
               <TouchableOpacity onPress={() => {
                   console.log("Mengirim Update:", tempAnnounce); // Cek log ini di terminal
                   handleUpdateAnnouncement();
               }} style={{backgroundColor:'blue', padding:10, borderRadius:8}}><Text style={{color:'white'}}>Update</Text></TouchableOpacity>
             </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDownloadModal} transparent={true} animationType="fade" onRequestClose={() => setShowDownloadModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📅 Download Rekap</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => {setPickerMode('from'); setShowPicker(true);}}><Text>Dari: {dateFrom.toLocaleDateString()}</Text><Ionicons name="calendar" size={20}/></TouchableOpacity>
            <TouchableOpacity style={[styles.dateBtn, {marginTop:10}]} onPress={() => {setPickerMode('to'); setShowPicker(true);}}><Text>Sampai: {dateTo.toLocaleDateString()}</Text><Ionicons name="calendar" size={20}/></TouchableOpacity>
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setShowDownloadModal(false)} style={{padding:10}}><Text style={{color:'red'}}>Batal</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleDownloadExcel} style={{backgroundColor:'green', padding:10, borderRadius:8}}><Text style={{color:'white'}}>Download</Text></TouchableOpacity>
            </View>
            {showPicker && <DateTimePicker value={pickerMode==='from'?dateFrom:dateTo} mode="date" display="default" onChange={onDateChange}/>}
          </View>
        </View>
      </Modal>

      <ReportModal visible={modalVisible} onClose={() => setModalVisible(false)} user={user} userData={userData} onSuccess={() => { setModalVisible(false); fetchData(); }} />
      <PermissionModal visible={permModalVisible} onClose={() => setPermModalVisible(false)} user={user} userData={userData} onSuccess={() => { setPermModalVisible(false); fetchData(); }} />
      <AttendanceModal visible={attModalVisible} onClose={() => setAttModalVisible(false)} user={user} userData={userData} onSuccess={() => { fetchData(); }} />
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
  
  marqueeContainer: { 
    marginTop: 0, 
    paddingTop: 40, 
    paddingBottom: 10,
    backgroundColor: '#fff7ed', 
    overflow: 'hidden', 
    borderBottomWidth: 1, 
    borderBottomColor: '#fed7aa' 
  },
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
  sosResolveBtn: { backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, marginTop: 15, width: '100%', alignItems: 'center' }
});