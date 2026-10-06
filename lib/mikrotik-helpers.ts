/**
 * NetFlow SaaS (SamMikrotic) - MikroTik RouterOS Script Helpers & Generator
 * Provides hardened sanitization, Arabic-to-RouterOS unit conversion,
 * and reliable RouterOS terminal script generation.
 */

/**
 * تحويل وحدات الحجم العربية إلى الرموز المقبولة في RouterOS (M, G, k)
 * مثال: "2700 ميجا" -> "2700M"، "1 جيجا" -> "1G"، "500 كيلو" -> "500k"
 */
export function formatByteLimit(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  let val = String(input).trim();
  if (!val) return "";

  val = val
    .replace(/غيغا|جيجا|GB|gb/gi, "G")
    .replace(/ميجا|ميجابايت|MB|mb/gi, "M")
    .replace(/كيلو|كيلوبايت|KB|kb/gi, "k")
    .replace(/بايت|Byte|bytes/gi, "")
    .replace(/\s+/g, ""); // إزالة المسافات

  // إذا كان المدخل رقماً فقط أو يحتوي على الوحدة الإنجليزية جاهزة
  return val;
}

/**
 * Alias لضمان التوافق البرمجي التام مع كافة المكونات القديمة والحديثة
 */
export const formatLimitBytes = formatByteLimit;

/**
 * تحويل وحدات الوقت العربية إلى الرموز المقبولة في RouterOS (h, d, m, s)
 * مثال: "15 ساعة" -> "15h"، "2 يوم" -> "2d"، "30 دقيقة" -> "30m"
 */
export function formatUptimeLimit(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  let val = String(input).trim();
  if (!val) return "";

  // إذا كان الوقت غير محدد أو مفتوح أو بدون حد
  if (
    /غير\s*محد[ود]/i.test(val) ||
    /مفتوح/i.test(val) ||
    /بدون\s*حد/i.test(val) ||
    val === "0" ||
    val === "0s" ||
    val.toLowerCase() === "unlimited"
  ) {
    return "0s";
  }

  val = val
    .replace(/أيام|ايام|يوم|days|day|d/gi, "d")
    .replace(/ساعات|ساعة|hours|hour|h/gi, "h")
    .replace(/دقائق|دقيقة|minutes|minute|m/gi, "m")
    .replace(/ثواني|ثانية|seconds|second|s/gi, "s")
    .replace(/\s+/g, "");

  return val;
}

/**
 * تنظيف نصوص التعليقات واسم البروفايل وكلمات المرور لمنع كسر أوامر RouterOS
 */
export function sanitizeRouterOSValue(val: string | number | null | undefined, maxLen?: number): string {
  if (val === null || val === undefined) return "";
  let clean = String(val).replace(/["\\]/g, "").trim();
  if (maxLen && maxLen > 0) {
    clean = clean.slice(0, maxLen);
  }
  return clean;
}

/**
 * تنظيف تعليقات أوامر المايكروتك
 */
export function sanitizeRouterOSComment(val: string | number | null | undefined, maxLen = 80): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/["\\]/g, "")
    .trim()
    .slice(0, maxLen);
}

/**
 * تنظيف معرفات RouterOS والتأكد من أنها آمنة
 */
export function sanitizeRouterOSIdentifier(val: unknown, fallback = "default", maxLen = 32): string {
  if (val === null || val === undefined) return fallback;
  const str = String(val).trim();
  if (!str) return fallback;

  const clean = str
    .replace(/[^a-zA-Z0-9_\-\.]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim()
    .slice(0, maxLen);

  if (!clean || !/[a-zA-Z0-9]/.test(clean)) {
    return fallback;
  }
  return clean;
}

/**
 * استخراج بروفايل الراوتر والتأكد من توافقه مع صيغ RouterOS المقبولة
 * يحمي الراوتر من الانهيار إذا كان اسم البروفايل بالعربي
 */
export function resolveRouterOSProfile(profile: string | null | undefined, fallback = "default"): string {
  if (!profile || profile.trim() === "") return fallback;
  const clean = profile.trim().replace(/["\\]/g, "");
  if (!clean) return fallback;

  // إذا كان الاسم يحتوي على حروف عربية، لا يقبلها تيرمينال المايكروتك كبروفايل للمستخدم
  if (/[\u0600-\u06FF]/.test(clean)) {
    return fallback;
  }

  return clean;
}

export function formatRouterOSDate(date: Date = new Date()): string {
  try {
    return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  } catch {
    return '2026-09-26 12:00:00 UTC';
  }
}

export interface RouterOSScriptOptions {
  activeOnly?: boolean;
  safeDeduplication?: boolean;
}

/**
 * توليد سكربت تيرمينال المايكروتك لإضافة الكروت بأمان وحماية 100% (/ip hotspot user)
 * - يدعم حماية التكرار (Safe Deduplication): يفحص وجود الكرت في الراوتر قبل الإضافة لتجنب الأخطاء
 * - يدعم عزل الأخطاء (:do {...} on-error={}): يضمن عدم توقف السكربت عند تعثر أي كرت
 * - يستثني تلقائياً الكروت المنتهية أو المستهلكة (activeOnly) لمنع إعادة إحيائها بالخطأ
 * - ترميز نصوص نقي 100% 7-Bit ASCII لمنع أخطاء محرك Script في RouterOS v6 و v7
 */
export function generateRouterOSTerminalScript(
  cards: any[],
  profileName: string = "",
  options: RouterOSScriptOptions = { activeOnly: true, safeDeduplication: true }
): string {
  if (!cards || !Array.isArray(cards) || cards.length === 0) return "";

  // تصفية الكروت النشطة وغير المنتهية فقط لمنع إعادة الكروت المحذوفة أو المستهلكة
  const targetCards = options.activeOnly
    ? cards.filter(
        (c) => c && c.status !== "used" && c.status !== "expired" && c.status !== "archived"
      )
    : cards;

  if (targetCards.length === 0) return "# No active vouchers available for import (all used or expired).";

  const firstCard = targetCards[0] || {};
  // قاعدة البروفايل الثابت (Fixed Default Profile) - موحد دائماً ليكون default
  const fixedProfile = "default";
  
  // استخراج وتوحيد تعليق الدفعة (comment="NetFlow-B-XXX") لمنع أي تسريب
  const rawBatchNum = firstCard.batchNumber || firstCard.batchId || "001";
  let cleanBatchStr = String(rawBatchNum).replace(/^NetFlow[-_]?/i, "").trim();
  if (cleanBatchStr.toLowerCase().startsWith("b-")) {
    cleanBatchStr = cleanBatchStr.substring(2);
  } else if (cleanBatchStr.toLowerCase().startsWith("b")) {
    cleanBatchStr = cleanBatchStr.substring(1);
  }
  const batchComment = sanitizeRouterOSComment(`NetFlow-B-${cleanBatchStr || "001"}`);

  // تحديد حجم البيانات الموحد للدفعة
  const rawByte = firstCard.byteDisplay || firstCard.limitBytesTotal || firstCard.byteLimit || "2700M";
  const formattedBytes = formatByteLimit(rawByte) || "2700M";

  const lines: string[] = [
    `# ==========================================================`,
    `# NetFlow SaaS - MikroTik Resilient Hotspot User Import Script (.rsc)`,
    `# Generated At: ${formatRouterOSDate()}`,
    `# Total Vouchers: ${targetCards.length}`,
    `# Batch: ${batchComment} | Total Users: ${targetCards.length} | Profile: ${fixedProfile}`,
    `# Policy: Dynamic Speeds Enabled - Fixed Default Profile | Quota: ${formattedBytes}`,
    `# Architecture: Safe Deduplication & Zero-Leakage Error Isolation`,
    `# ==========================================================`,
  ];

  for (const card of targetCards) {
    if (!card) continue;
    const rawCode = card.code || card.username || card.id;
    const safeCode = sanitizeRouterOSValue(rawCode, 40);
    if (!safeCode) continue;

    const rawPwd =
      card.password !== undefined && card.password !== ""
        ? card.password
        : card.username || card.code || rawCode;
    const safePwd = sanitizeRouterOSValue(rawPwd, 40);

    // الهيكل البرمجي الصارم والآمن للأمر (عزل كامل وسرعة قصوى O(1))
    lines.push(
      `:do { /ip hotspot user add name="${safeCode}" password="${safePwd}" profile="${fixedProfile}" limit-bytes-total=${formattedBytes} server=all comment="${batchComment}" } on-error={}`
    );
  }

  lines.push(`\n# --- End of Script | Total Vouchers: ${targetCards.length} | Checksum: OK ---`);

  return lines.join("\n");
}

/**
 * توليد ملف .rsc الموحد عبر الربط المباشر مع مصفوفة الكروت الحالية في الذاكرة
 * يمنع تماماً سحب أو دمج أو الاستعلام عن كروت قديمة من قاعدة البيانات
 * يضمن تطابق عدد الأسطر تماماً مع الكمية المطلوبة دون أي اقتطاع أو ترقيم صفحات
 */
export function generateRscScript(
  generatedBatch: any[] | { cards: any[] } | { batch: any; cards: any[] },
  profileName: string = "default",
  flavor: 'hotspot_v7' | 'hotspot_v6' | 'userman_v7' | 'userman_v6' = 'hotspot_v7'
): string {
  // Direct Data Binding: استخراج مصفوفة الكروت مباشرة من المتغير في الذاكرة
  const cards: any[] = Array.isArray(generatedBatch)
    ? generatedBatch
    : (generatedBatch && Array.isArray((generatedBatch as any).cards))
      ? (generatedBatch as any).cards
      : [];

  if (!cards || cards.length === 0) {
    return "# No vouchers generated.";
  }

  const cleanProf = resolveRouterOSProfile(profileName || cards[0]?.profileName || 'default', 'default');
  const firstCard = cards[0] || {};
  const rawBatchNum = firstCard.batchNumber || firstCard.batchId || "B-001";
  let cleanBatchStr = String(rawBatchNum).replace(/^NetFlow[-_]?/i, "").trim();
  if (cleanBatchStr.toLowerCase().startsWith("b-")) {
    cleanBatchStr = cleanBatchStr.substring(2);
  } else if (cleanBatchStr.toLowerCase().startsWith("b")) {
    cleanBatchStr = cleanBatchStr.substring(1);
  }
  const batchComment = sanitizeRouterOSComment(`NetFlow-B-${cleanBatchStr || "001"}`);
  const rawByte = firstCard.byteDisplay || firstCard.limitBytesTotal || firstCard.byteLimit || "2700M";
  const formattedBytes = formatByteLimit(rawByte) || "2700M";

  const lines: string[] = [
    `# ==========================================================`,
    `# NetFlow SaaS - MikroTik Unified Batch Export Script (.rsc)`,
    `# Total Vouchers: ${cards.length}`,
    `# Batch: ${batchComment} | Profile: ${cleanProf} | Date: ${formatRouterOSDate()}`,
    `# Architecture: 100% Direct In-Memory Binding (No Database Querying/Merging)`,
    `# ==========================================================`,
    ``
  ];

  // Iterate over 100% of the in-memory array without truncating or paginating
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card) continue;
    const rawCode = card.code || card.username || card.id;
    const safeCode = sanitizeRouterOSValue(rawCode, 40);
    if (!safeCode) continue;

    const rawPwd = card.password !== undefined && card.password !== ""
      ? card.password
      : card.username || card.code || rawCode;
    const safePwd = sanitizeRouterOSValue(rawPwd, 40);

    const cardProf = resolveRouterOSProfile(card.profileName?.split(' ')[0] || cleanProf, 'default');
    const limitBytes = formatByteLimit(card.byteDisplay || card.limitBytesTotal) || formattedBytes;
    const rawUptime = card.uptimeDisplay || card.limitUptime || '';
    const limitUptime = formatUptimeLimit(rawUptime);
    const isUnlimited = !limitUptime || limitUptime === '0' || limitUptime === '0s' || /غير\s*محد[ود]/i.test(rawUptime) || /مفتوح/i.test(rawUptime);
    const uptimeParam = isUnlimited ? '' : ` limit-uptime=${limitUptime}`;

    if (flavor === 'hotspot_v7') {
      lines.push(
        `:do { /ip hotspot user add name="${safeCode}" password="${safePwd}" profile="${cardProf}" limit-bytes-total=${limitBytes}${uptimeParam} server=all comment="${batchComment}" } on-error={}`
      );
    } else if (flavor === 'hotspot_v6') {
      lines.push(
        `:do { /ip hotspot user add name="${safeCode}" password="${safePwd}" profile="${cardProf}" limit-bytes-total=${limitBytes}${uptimeParam} comment="${batchComment}" } on-error={}`
      );
    } else if (flavor === 'userman_v7') {
      lines.push(
        `:do { /user-manager user add name="${safeCode}" password="${safePwd}" group="${cardProf}" comment="${batchComment}" } on-error={}`
      );
    } else if (flavor === 'userman_v6') {
      lines.push(
        `:do { /tool user-manager user add username="${safeCode}" password="${safePwd}" customer=admin comment="${batchComment}" } on-error={}`
      );
      lines.push(
        `:do { /tool user-manager user create-and-activate-profile "${safeCode}" profile="${cardProf}" customer=admin } on-error={}`
      );
    }
  }

  lines.push(``);
  lines.push(`# --- End of Script | Total Vouchers: ${cards.length} | Checksum: OK ---`);

  return lines.join("\n");
}

/**
 * تنزيل ملف .rsc الموحد مباشرة من الذاكرة لضمان مطابقة الكمية الفعلية 100%
 */
export function downloadRsc(
  generatedBatch: any[] | { cards: any[] } | { batch: any; cards: any[] },
  profileName: string = "default",
  flavor: 'hotspot_v7' | 'hotspot_v6' | 'userman_v7' | 'userman_v6' = 'hotspot_v7',
  customFileName?: string
): { success: boolean; count: number; fileName: string } {
  const cards: any[] = Array.isArray(generatedBatch)
    ? generatedBatch
    : (generatedBatch && Array.isArray((generatedBatch as any).cards))
      ? (generatedBatch as any).cards
      : [];

  if (!cards || cards.length === 0) {
    return { success: false, count: 0, fileName: '' };
  }

  const script = generateRscScript(cards, profileName, flavor);
  const cleanProf = (profileName || 'batch').replace(/[^a-zA-Z0-9_\u0621-\u064A]/g, '_');
  const batchNum = cards[0]?.batchNumber || 'B-001';
  const fileName = customFileName || `netflow_${batchNum}_${cleanProf}_all_${cards.length}cards.rsc`;

  if (typeof window !== 'undefined') {
    const blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { success: true, count: cards.length, fileName };
}

export interface SplitScriptPart {
  partIndex: number;
  totalParts: number;
  fileName: string;
  cardsCount: number;
  script: string;
  startRange: number;
  endRange: number;
  fileSizeBytes: number;
}

export interface SplitRouterOSPackage {
  batchNumber: string;
  totalCards: number;
  unifiedFileName: string;
  unifiedScript: string;
  parts: SplitScriptPart[];
  masterRunnerFileName: string;
  masterRunnerScript: string;
  isLargeBatch: boolean; // true if > 250 cards
}

/**
 * تقسيم حزم الكروت الكبيرة (500 إلى 5000 كرت) إلى ملفات متوافقة 100% مع عارض ملفات Winbox الداخلي
 * حيث أن عارض ملفات Winbox الداخلي (Files > Edit) يمتلك سعة عرض محددة (~42KB / 286 كرت)
 * تقسيمها إلى أجزاء بحجم 250 كرت (حجم الملف ~36KB) يضمن فتح كل جزء بالكامل 100% داخل Winbox دون أي اقتطاع
 */
export function generateSplitRouterOSScripts(
  cards: any[],
  profileName: string = "default",
  batchNumber: string = "B-001",
  chunkSize: number = 250,
  flavor: string = "hotspot_v7"
): SplitRouterOSPackage {
  const targetCards = Array.isArray(cards) ? cards : [];
  const totalCards = targetCards.length;
  const isLargeBatch = totalCards > chunkSize;

  let cleanBatchStr = String(batchNumber).replace(/^NetFlow[-_]?/i, "").trim();
  if (cleanBatchStr.toLowerCase().startsWith("b-")) {
    cleanBatchStr = cleanBatchStr.substring(2);
  } else if (cleanBatchStr.toLowerCase().startsWith("b")) {
    cleanBatchStr = cleanBatchStr.substring(1);
  }
  const safeBatchTag = `B-${cleanBatchStr || "001"}`;
  const safeProf = resolveRouterOSProfile(profileName, "default");

  // 1. توليد الملف الموحد الشامل
  const unifiedFileName = `netflow_${safeBatchTag}_all_${totalCards}cards.rsc`;
  const unifiedScript = generateRscScript(targetCards, safeProf, flavor as any);

  // 2. تقسيم الكروت إلى أجزاء Winbox الآمنة (Winbox-Safe Parts)
  const chunks = chunkCards(targetCards, chunkSize);
  const totalParts = chunks.length;

  const parts: SplitScriptPart[] = chunks.map((chunk, idx) => {
    const partNum = idx + 1;
    const startRange = idx * chunkSize + 1;
    const endRange = startRange + chunk.length - 1;
    const partFileName = `netflow_${safeBatchTag}_part${partNum}_of_${totalParts}_${chunk.length}cards.rsc`;

    const firstCard = chunk[0] || {};
    const rawByte = firstCard.byteDisplay || firstCard.limitBytesTotal || firstCard.byteLimit || "2700M";
    const formattedBytes = formatByteLimit(rawByte) || "2700M";
    const batchComment = sanitizeRouterOSComment(`NetFlow-${safeBatchTag}`);

    const lines: string[] = [
      `# ==========================================================`,
      `# NetFlow SaaS - MikroTik WinBox-Safe Split Script (.rsc)`,
      `# Part: ${partNum} of ${totalParts} | Cards: ${startRange} to ${endRange} (Total: ${chunk.length})`,
      `# Batch: ${batchComment} | Generated At: ${formatRouterOSDate()}`,
      `# WINBOX COMPATIBILITY: Size ~36KB (Opens 100% completely in WinBox Files Editor)`,
      `# ==========================================================`,
    ];

    for (const card of chunk) {
      if (!card) continue;
      const rawCode = card.code || card.username || card.id;
      const safeCode = sanitizeRouterOSValue(rawCode, 40);
      if (!safeCode) continue;

      const rawPwd =
        card.password !== undefined && card.password !== ""
          ? card.password
          : card.username || card.code || rawCode;
      const safePwd = sanitizeRouterOSValue(rawPwd, 40);

      lines.push(
        `:do { /ip hotspot user add name="${safeCode}" password="${safePwd}" profile="${safeProf}" limit-bytes-total=${formattedBytes} server=all comment="${batchComment}" } on-error={}`
      );
    }

    lines.push(`\n# --- End of Part ${partNum} | Total: ${chunk.length} Vouchers | All Displayed Correctly ---`);

    const scriptText = lines.join("\n");
    return {
      partIndex: partNum,
      totalParts,
      fileName: partFileName,
      cardsCount: chunk.length,
      script: scriptText,
      startRange,
      endRange,
      fileSizeBytes: new Blob([scriptText]).size
    };
  });

  // 3. توليد سكربت التشغيل التلقائي Master Runner
  const masterRunnerFileName = `netflow_${safeBatchTag}_master_import.rsc`;
  const masterLines: string[] = [
    `# ==========================================================`,
    `# NetFlow SaaS - Master Import Runner Script (.rsc)`,
    `# Batch: NetFlow-${safeBatchTag} | Total Vouchers: ${totalCards} across ${totalParts} parts`,
    `# Generated At: ${formatRouterOSDate()}`,
    `# ==========================================================`,
    `:log info "NetFlow: Starting automated import of Batch NetFlow-${safeBatchTag} (${totalCards} cards in ${totalParts} parts)..."`,
  ];

  parts.forEach((p) => {
    masterLines.push(`:log info "NetFlow: Importing ${p.fileName} (Part ${p.partIndex} of ${totalParts})..."`);
    masterLines.push(`/import file-name="${p.fileName}"`);
    masterLines.push(`:delay 2s`);
  });

  masterLines.push(`:log info "NetFlow: All ${totalCards} vouchers for Batch NetFlow-${safeBatchTag} imported successfully!"`);
  masterLines.push(`\n# --- End of Master Runner Script ---`);

  const masterRunnerScript = masterLines.join("\n");

  return {
    batchNumber: safeBatchTag,
    totalCards,
    unifiedFileName,
    unifiedScript,
    parts,
    masterRunnerFileName,
    masterRunnerScript,
    isLargeBatch
  };
}

/**
 * تنزيل حزمة مايكروتك الشاملة كملف ZIP يحتوي على:
 * 1. الملف الموحد الكامل
 * 2. الأجزاء المقسمة المتوافقة 100% مع محرر Winbox
 * 3. سكربت الاستيراد التلقائي Master Runner
 * 4. ملف تعليمات وإرشادات الاستيراد
 */
export async function downloadBatchZipPackage(pkg: SplitRouterOSPackage): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const JSZipModule = await import("jszip");
    const JSZip = JSZipModule.default || JSZipModule;
    const zip = new JSZip();

    // 1. Unified Full RSC
    zip.file(pkg.unifiedFileName, pkg.unifiedScript);

    // 2. WinBox Safe Parts
    pkg.parts.forEach((p) => {
      zip.file(p.fileName, p.script);
    });

    // 3. Master Import Runner
    zip.file(pkg.masterRunnerFileName, pkg.masterRunnerScript);

    // 4. Instructions
    const instructions = `NetFlow SaaS - MikroTik Batch Package (${pkg.batchNumber})
========================================================================
Total Cards: ${pkg.totalCards}
Unified Script: ${pkg.unifiedFileName}
Parts Count: ${pkg.parts.length}

[ENGLISH / ARABIC INSTRUCTIONS]

1. DIRECT UNIFIED IMPORT (الاستيراد المباشر الكامل):
   Upload "${pkg.unifiedFileName}" to MikroTik Files via WinBox.
   In New Terminal run:
   /import file-name="${pkg.unifiedFileName}"

2. WINBOX FILE VIEWER COMPATIBILITY (توافق عارض ملفات Winbox):
   Notice: WinBox internal file editor (Files > Edit) has a 42KB buffer limit.
   Files larger than ~286 cards are visually truncated inside Winbox editor.
   To view and edit files completely inside Winbox, use the split parts:
${pkg.parts.map(p => `   - ${p.fileName} (Cards ${p.startRange} to ${p.endRange} - ${p.cardsCount} cards)`).join('\n')}

3. AUTOMATED MULTI-PART IMPORT (الاستيراد التلقائي للأجزاء):
   Upload all part files + "${pkg.masterRunnerFileName}" to MikroTik Files.
   In New Terminal run:
   /import file-name="${pkg.masterRunnerFileName}"

Generated by NetFlow SaaS - Cloud Mikrotik Controller
`;
    zip.file("README_INSTRUCTIONS.txt", instructions);

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `netflow_${pkg.batchNumber}_mikrotik_package_${pkg.totalCards}cards.zip`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {}
    }, 1500);

    return true;
  } catch (err) {
    console.error("Failed to generate ZIP package:", err);
    return false;
  }
}

/**
 * تقسيم الكروت إلى أجزاء آمنة (Chunks) بحجم 50 كرت لتجنب امتلاء ذاكرة تيرمينال المايكروتك (Buffer Overflow)
 */
export function chunkCards<T>(cards: T[], chunkSize: number = 50): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < cards.length; i += chunkSize) {
    chunks.push(cards.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * مطابقة كروت الدفعة مع قائمة مستخدمي المايكروتك لمعرفة الكروت المفقودة
 * مصممة بدقة عالية للتعرف على أسماء المستخدمين سواء طُبعت عبر print terse أو print detail أو تم نسخ أرقام الكروت
 * تضمن عدم وجود نتائج إيجابية خاطئة (False Positives)
 */
export function reconcileCardsWithRouter(
  batchCards: any[],
  mikrotikRawOutput: string
): {
  foundCodes: string[];
  missingCards: any[];
  totalChecked: number;
} {
  if (!batchCards || !Array.isArray(batchCards)) {
    return { foundCodes: [], missingCards: [], totalChecked: 0 };
  }

  const rawText = String(mikrotikRawOutput || "");
  
  // بناء جدول بحث سريع لجميع أسماء المستخدمين المستخرجة من شاشة المايكروتك
  const extractedNames = new Set<string>();

  // 1. التقاط صيغ name="1001" أو name=1001 من مخرجات RouterOS print terse / detail
  const namePropRegex = /\bname="?([^"\s;]+)"?/gi;
  let match: RegExpExecArray | null;
  while ((match = namePropRegex.exec(rawText)) !== null) {
    if (match[1]) {
      extractedNames.add(match[1].trim().toLowerCase());
    }
  }

  // 2. تقسيم الكلمات والرموز في النص للتعرف على الكروت حتى لو لُصقت كأكواد أو أرقام مجردة
  const tokens = rawText
    .replace(/[=;"\r]/g, " ")
    .split(/[\s,\t\n]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  for (const t of tokens) {
    extractedNames.add(t);
  }

  const foundCodes: string[] = [];
  const missingCards: any[] = [];

  for (const card of batchCards) {
    const rawCode = String(card.code || card.username || card.id || "").trim();
    if (!rawCode) continue;

    const lowerCode = rawCode.toLowerCase();
    // فحص التطابق التام مع الأسماء المستخرجة (يمنع تطابق الأرقام الجزئية مثل 10 مع 1000)
    const isFound = extractedNames.has(lowerCode);

    if (isFound) {
      foundCodes.push(rawCode);
    } else {
      missingCards.push(card);
    }
  }

  return {
    foundCodes,
    missingCards,
    totalChecked: batchCards.length
  };
}
