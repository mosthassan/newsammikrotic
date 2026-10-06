'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardBatch, CardTemplate, Profile, Tenant, CodeCharSet, MikroTikInjectionAudit } from '@/types';
import { DEFAULT_TEMPLATES, COLOR_SCHEME_PRESETS, svgToDataUri } from '@/lib/templates';
import { CardPreview } from './CardPreview';
import { A4SheetPreview } from './A4SheetPreview';
import { InteractiveCardCanvas } from './InteractiveCardCanvas';
import { StudioControlPanel } from './StudioControlPanel';
import { CloneTemplateModal } from './CloneTemplateModal';
import { generateBatchCards, generateRouterOSTerminalScript } from '@/lib/store';
import { generateCardsPdf } from '@/lib/pdf-generator';
import { saveTemplateToFirestore, loadTemplatesFromFirestore, deleteTemplateFromFirestore } from '@/lib/firestore-service';
import { exportCardElementAsPng, exportTemplateBackgroundAsPng, exportCardWithFallback } from '@/lib/export-image';
import {
  formatByteLimit,
  formatLimitBytes,
  formatUptimeLimit,
  sanitizeRouterOSComment,
  sanitizeRouterOSValue,
  sanitizeRouterOSIdentifier,
  resolveRouterOSProfile,
  chunkCards,
  formatRouterOSDate,
  generateSplitRouterOSScripts,
  downloadBatchZipPackage,
  generateRscScript,
  downloadRsc
} from '@/lib/mikrotik-helpers';
import { copyTextToClipboard } from '@/lib/utils';
import {
  FileDown,
  Printer,
  CheckCircle,
  AlertCircle,
  Eye,
  RefreshCw,
  Move,
  Camera,
  Download,
  Image as ImageIcon,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  Cloud,
  Sparkles,
  Tag,
  Copy,
  X,
  Server,
  Wifi,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Terminal,
  ShieldCheck,
  Archive,
  FolderDown,
  FileText,
  Check
} from 'lucide-react';

interface CardStudioProps {
  tenant: Tenant;
  profiles: Profile[];
  templates: CardTemplate[];
  onBatchSaved: (batch: CardBatch, cards: Card[]) => Promise<any> | void;
  onUpdateProfiles?: (profiles: Profile[]) => void;
  onSaveTemplate?: (template: CardTemplate) => Promise<any> | void;
  onDeleteTemplate?: (templateId: string) => Promise<any> | void;
}

export const CardStudio: React.FC<CardStudioProps> = ({
  tenant,
  profiles = [],
  templates: initialTemplates = [],
  onBatchSaved,
  onUpdateProfiles,
  onSaveTemplate,
  onDeleteTemplate
}) => {
  const safeProfiles = useMemo(() => (Array.isArray(profiles) && profiles.length > 0 ? profiles : []), [profiles]);
  const safeInitialTemplates = useMemo(() => (Array.isArray(initialTemplates) && initialTemplates.length > 0 ? initialTemplates : DEFAULT_TEMPLATES), [initialTemplates]);

  // Generator State
  const [selectedProfileId, setSelectedProfileId] = useState<string>(safeProfiles[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(24);
  const [prefix, setPrefix] = useState<string>('');
  const [codeLength, setCodeLength] = useState<number>(6);
  const [codeCharSet, setCodeCharSet] = useState<CodeCharSet>('digits_only');
  const [passwordType, setPasswordType] = useState<'same_as_username' | 'separate_pin' | 'no_password'>('same_as_username');

  // Keep selectedProfileId in sync if profiles load asynchronously
  useEffect(() => {
    if (safeProfiles.length > 0) {
      if (!selectedProfileId || !safeProfiles.some(p => p.id === selectedProfileId)) {
        setSelectedProfileId(safeProfiles[0].id);
      }
    }
  }, [safeProfiles, selectedProfileId]);

  // Local storage cache key for instant recovery
  const tenantId = tenant?.id || 'tenant_main_01';
  const LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY = `netflow_custom_templates_${tenantId}`;

  // Template State
  const [templates, setTemplates] = useState<CardTemplate[]>(
    safeInitialTemplates
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(safeInitialTemplates[0]?.id || 'tpl_cyber_neon_svg');
  const currentTemplate = useMemo(() => {
    const list = Array.isArray(templates) && templates.length > 0 ? templates : DEFAULT_TEMPLATES;
    return list.find(t => t.id === selectedTemplateId) || list[0] || DEFAULT_TEMPLATES[0];
  }, [templates, selectedTemplateId]);

  // Keep templates state updated if parent provides new templates
  useEffect(() => {
    if (Array.isArray(initialTemplates) && initialTemplates.length > 0) {
      setTemplates(prev => {
        const customOnly = prev.filter(t => t.isCustom || t.savedByUser || t.isAiGenerated);
        const existingIds = new Set(customOnly.map(t => t.id));
        const fromParent = initialTemplates.filter(t => !existingIds.has(t.id));
        return [...customOnly, ...fromParent];
      });
    }
  }, [initialTemplates]);

  // Saved Template Naming Modal State
  const [isNamingModalOpen, setIsNamingModalOpen] = useState<boolean>(false);
  const [customTemplateName, setCustomTemplateName] = useState<string>('');
  const [templateLinkedProfileId, setTemplateLinkedProfileId] = useState<string>('');
  const [saveAsMode, setSaveAsMode] = useState<'new' | 'update'>('new');
  const [isSavingCustomTemplate, setIsSavingCustomTemplate] = useState<boolean>(false);

  // Clone Template Modal State
  const [isCloneModalOpen, setIsCloneModalOpen] = useState<boolean>(false);
  const [cloneSourceTemplateId, setCloneSourceTemplateId] = useState<string>('');
  const [isCloningTemplate, setIsCloningTemplate] = useState<boolean>(false);

  // AI Template Generator State
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiStylePreset] = useState<string>('modern_dark');
  const [isGeneratingAiTemplate, setIsGeneratingAiTemplate] = useState<boolean>(false);
  const [aiGenerationStep, setAiGenerationStep] = useState<string>('');
  const [aiError, setAiError] = useState<string | null>(null);

  // Image Export State
  const [isExportingImage, setIsExportingImage] = useState<boolean>(false);
  const [showImageExportDropdown, setShowImageExportDropdown] = useState<boolean>(false);

  // Firestore Save Template State
  const [isSavingToFirestore, setIsSavingToFirestore] = useState<boolean>(false);
  const [isSavedInFirestore, setIsSavedInFirestore] = useState<boolean>(false);

  // Instant load from localStorage cache on mount
  useEffect(() => {
    if (!tenantId) return;
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY);
      if (cached) {
        const parsed: CardTemplate[] = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTemplates(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const newOnes = parsed.filter(t => !existingIds.has(t.id));
            return [...newOnes, ...prev];
          });
        }
      }
    } catch (e) {
      console.warn('Could not read cached templates from localStorage', e);
    }
  }, [tenantId, LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY]);

  // Load custom templates from Firestore on mount
  useEffect(() => {
    if (!tenantId) return;
    let isMounted = true;
    loadTemplatesFromFirestore(tenantId).then(savedTpls => {
      if (isMounted && savedTpls && savedTpls.length > 0) {
        setTemplates(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newOnes = savedTpls.filter(t => !existingIds.has(t.id));
          const merged = [...newOnes, ...prev];
          try {
            const customs = merged.filter(t => t.isCustom || t.savedByUser);
            localStorage.setItem(LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY, JSON.stringify(customs));
          } catch (e) {}
          return merged;
        });
      }
    }).catch(err => {
      console.warn('Firestore load templates note:', err);
    });
    return () => {
      isMounted = false;
    };
  }, [tenantId, LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY]);

  // Auto-switch to the template linked to this profile if available
  useEffect(() => {
    if (!selectedProfileId) return;
    const linkedTpl = (templates || []).find(t => t.linkedProfileId === selectedProfileId);
    if (linkedTpl && linkedTpl.id !== selectedTemplateId) {
      setSelectedTemplateId(linkedTpl.id);
      setIsSavedInFirestore(true);
      const prof = safeProfiles.find(p => p.id === selectedProfileId);
      setSuccessMessage(`تم تفعيل القالب المعتمد تلقائياً: "${linkedTpl.name}" لباقة ${prof?.name || ''}`);
      setTimeout(() => setSuccessMessage(null), 3500);
    }
  }, [selectedProfileId, templates, safeProfiles, selectedTemplateId]);

  // File Upload & Drag-and-Drop state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const processUploadedFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, WEBP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;

      const customId = `tpl_custom_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}_${file.size}`;
      const newCustomTemplate: CardTemplate = {
        ...currentTemplate,
        id: customId,
        name: `قالب مخصص (${file.name.length > 12 ? file.name.slice(0, 12) + '...' : file.name})`,
        bgType: 'image',
        bgImage: dataUrl,
        textColor: '#ffffff',
        accentColor: '#38bdf8',
        badgeBg: '#f59e0b',
        badgeTextColor: '#000000',
        themeStyle: 'modern_dark'
      };

      setTemplates(prev => [newCustomTemplate, ...prev.filter(t => t.id !== customId)]);
      setSelectedTemplateId(customId);
      setSuccessMessage('تم رفع القالب المخصص وتطبيقه بنجاح على التصميم!');
      setTimeout(() => setSuccessMessage(null), 4000);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleRemoveCustomTemplate = () => {
    handleUpdateTemplate({ bgType: 'gradient', bgImage: undefined, svgCode: undefined });
    setSuccessMessage('تمت إزالة القالب المخصص والرجوع للنمط التلقائي');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // AI Template Generator Handler
  const handleGenerateAiTemplate = async () => {
    if (!aiPrompt.trim()) {
      setAiError('يرجى كتابة وصف القالب المطلوب أولاً');
      return;
    }
    setAiError(null);
    setIsGeneratingAiTemplate(true);
    setAiGenerationStep('جاري تحليل الفكرة وتصميم الهيكل الهندسي عبر Gemini AI...');

    try {
      const res = await fetch('/api/gemini/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          networkName: tenant?.businessName || 'شبكتي',
          stylePreset: aiStylePreset
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'فشل في توليد القالب عبر الذكاء الاصطناعي');
      }

      setAiGenerationStep('جاري بناء وتجهيز كود الفيكتور SVG عالي الدقة...');
      const data = await res.json();

      const newTemplateId = data.id || `tpl_ai_${data.name?.slice(0, 10) || 'generated'}`;
      const newAiTemplate: CardTemplate = {
        ...currentTemplate,
        id: newTemplateId,
        name: data.name || `قالب AI: ${aiPrompt.slice(0, 18)}...`,
        bgType: 'image',
        bgImage: data.svgDataUri || svgToDataUri(data.svgCode),
        svgCode: data.svgCode,
        textColor: data.textColor || '#ffffff',
        accentColor: data.accentColor || '#38bdf8',
        badgeBg: data.badgeBg || '#f59e0b',
        badgeTextColor: data.badgeTextColor || '#000000',
        bgColor: data.bgColor || '#0f172a',
        themeStyle: data.themeStyle || 'cyber_neon',
        isAiGenerated: true
      };

      setTemplates(prev => [newAiTemplate, ...prev.filter(t => t.id !== newTemplateId)]);
      setSelectedTemplateId(newTemplateId);
      setIsSavedInFirestore(false);
      setSuccessMessage(`تم توليد القالب بالذكاء الاصطناعي بنجاح: "${newAiTemplate.name}"!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('AI Template Generation Error:', err);
      let friendlyError = err.message || 'حدث خطأ أثناء توليد القالب بالذكاء الاصطناعي';
      if (typeof friendlyError === 'string' && friendlyError.includes('GEMINI_API_KEY')) {
        friendlyError = 'مفتاح GEMINI_API_KEY غير مهيأ في بيئة العمل، يرجى إضافته في إعدادات المنصة';
      } else if (typeof friendlyError === 'string' && (friendlyError.includes('quota') || friendlyError.includes('RESOURCE_EXHAUSTED'))) {
        friendlyError = 'تم استنفاد الحصة المؤقتة لمفتاح Gemini، يرجى المحاولة بعد دقيقة أو استخدام نمط جاهز';
      }
      setAiError(friendlyError);
    } finally {
      setIsGeneratingAiTemplate(false);
      setAiGenerationStep('');
    }
  };

  // Firestore Save Template Handler
  const handleSaveTemplateToFirestore = async () => {
    setIsSavingToFirestore(true);
    try {
      const res = await saveTemplateToFirestore(tenant.id, currentTemplate);
      if (res.success) {
        setIsSavedInFirestore(true);
        setSuccessMessage(`تم حفظ القالب "${currentTemplate.name}" بنجاح في Firestore!`);
        setTimeout(() => setSuccessMessage(null), 4500);
      } else {
        alert(res.error || 'فشل حفظ القالب في قاعدة البيانات');
      }
    } catch (err) {
      console.error('Save template error:', err);
      alert('حدث خطأ أثناء حفظ القالب');
    } finally {
      setIsSavingToFirestore(false);
    }
  };

  // Open Save & Naming Modal
  const handleOpenSaveModal = (mode: 'new' | 'update' = 'new') => {
    setSaveAsMode(mode);
    if (mode === 'update' && currentTemplate.isCustom) {
      setCustomTemplateName(currentTemplate.name);
      setTemplateLinkedProfileId(currentTemplate.linkedProfileId || selectedProfileId || '');
    } else {
      // Auto-suggest name based on selected profile
      const prof = safeProfiles.find(p => p.id === selectedProfileId);
      const suggested = prof
        ? (prof.price ? `قالب كرت أبو ${prof.price}` : `قالب باقة ${prof.name}`)
        : `قالب كرت مخصص ${(templates || []).filter(t => t.isCustom).length + 1}`;
      setCustomTemplateName(suggested);
      setTemplateLinkedProfileId(selectedProfileId || '');
    }
    setIsNamingModalOpen(true);
  };

  // Save Custom Named Template to Cloud and Local Cache
  const handleSaveCustomNamedTemplate = async () => {
    const trimmedName = customTemplateName.trim();
    if (!trimmedName) {
      alert('يرجى إدخال اسم للقالب أولاً (مثال: قالب كرت أبو 200)');
      return;
    }

    setIsSavingCustomTemplate(true);
    try {
      const isUpdating = saveAsMode === 'update' && currentTemplate.isCustom;
      const tplId = isUpdating
        ? currentTemplate.id
        : `tpl_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const linkedProf = safeProfiles.find(p => p.id === templateLinkedProfileId);

      const templateToSave: CardTemplate = {
        ...currentTemplate,
        id: tplId,
        name: trimmedName,
        isCustom: true,
        savedByUser: true,
        linkedProfileId: templateLinkedProfileId || undefined,
        linkedProfileName: linkedProf?.name || undefined,
        updatedAt: new Date().toISOString(),
        createdAt: isUpdating ? (currentTemplate.createdAt || new Date().toISOString()) : new Date().toISOString()
      };

      // 1. Update local state
      setTemplates(prev => {
        const next = [templateToSave, ...prev.filter(t => t.id !== tplId)];
        try {
          const customs = next.filter(t => t.isCustom || t.savedByUser);
          localStorage.setItem(LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY, JSON.stringify(customs));
        } catch (err) {}
        return next;
      });

      setSelectedTemplateId(tplId);
      setIsSavedInFirestore(true);

      // 2. Persist to Firestore
      const res = await saveTemplateToFirestore(tenant.id, templateToSave);
      if (!res.success) {
        console.warn('Firestore template save warning:', res.error);
      }

      // 3. Notify parent if handler passed
      if (onSaveTemplate) {
        await onSaveTemplate(templateToSave);
      }

      setIsNamingModalOpen(false);
      setSuccessMessage(`تم حفظ القالب بنجاح باسم "${trimmedName}" ومزامنته سحابياً!`);
      setTimeout(() => setSuccessMessage(null), 4500);
    } catch (err: any) {
      console.error('Error saving custom template:', err);
      alert(err?.message || 'حدث خطأ أثناء حفظ القالب');
    } finally {
      setIsSavingCustomTemplate(false);
    }
  };

  // Delete Custom Template from Cloud
  const handleDeleteCustomTemplate = async (templateId: string, templateName: string) => {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف القالب "${templateName}" من السحابة؟`)) {
      return;
    }

    try {
      // 1. Local state update
      setTemplates(prev => {
        const next = prev.filter(t => t.id !== templateId);
        try {
          const customs = next.filter(t => t.isCustom || t.savedByUser);
          localStorage.setItem(LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY, JSON.stringify(customs));
        } catch (e) {}
        return next;
      });

      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(DEFAULT_TEMPLATES[0].id);
      }

      // 2. Delete from Firestore
      await deleteTemplateFromFirestore(tenant.id, templateId);

      // 3. Notify parent
      if (onDeleteTemplate) {
        await onDeleteTemplate(templateId);
      }

      setSuccessMessage(`تم حذف القالب "${templateName}" بنجاح.`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Error deleting custom template:', err);
      alert('فشل حذف القالب');
    }
  };

  // Open Clone Template Modal
  const handleOpenCloneModal = (sourceTemplateId?: string) => {
    setCloneSourceTemplateId(sourceTemplateId || selectedTemplateId || currentTemplate.id);
    setIsCloneModalOpen(true);
  };

  // Confirm Template Cloning & Reuse across categories/profiles
  const handleConfirmClone = async (params: {
    sourceTemplateId: string;
    targetProfileId?: string;
    newTemplateName: string;
    colorPresetId?: string;
  }) => {
    setIsCloningTemplate(true);
    try {
      const source = (templates || []).find(t => t.id === params.sourceTemplateId) || currentTemplate;
      const targetProf = safeProfiles.find(p => p.id === params.targetProfileId);
      
      const newTemplateId = `tpl_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      
      // Determine colors
      let bgGradientStart = source.bgGradientStart;
      let bgGradientEnd = source.bgGradientEnd;
      let accentColor = source.accentColor;
      let badgeBg = source.badgeBg;
      let textColor = source.textColor;
      let patternStyle = source.patternStyle;

      if (params.colorPresetId) {
        const preset = COLOR_SCHEME_PRESETS.find(p => p.id === params.colorPresetId);
        if (preset) {
          bgGradientStart = preset.bgGradientStart;
          bgGradientEnd = preset.bgGradientEnd;
          accentColor = preset.accentColor;
          badgeBg = preset.badgeBg;
          textColor = preset.textColor;
          if (preset.patternStyle) patternStyle = preset.patternStyle;
        }
      }

      // Clone elements with exact positions, styling, and geometry
      const clonedElements = JSON.parse(JSON.stringify(source.elements || []));

      const clonedTemplate: CardTemplate = {
        ...source,
        id: newTemplateId,
        name: params.newTemplateName,
        isCustom: true,
        savedByUser: true,
        linkedProfileId: params.targetProfileId || undefined,
        linkedProfileName: targetProf?.name || undefined,
        bgGradientStart,
        bgGradientEnd,
        accentColor,
        badgeBg,
        textColor,
        patternStyle,
        elements: clonedElements,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 1. Update local state
      setTemplates(prev => {
        const next = [clonedTemplate, ...prev.filter(t => t.id !== newTemplateId)];
        try {
          const customs = next.filter(t => t.isCustom || t.savedByUser);
          localStorage.setItem(LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY, JSON.stringify(customs));
        } catch (err) {}
        return next;
      });

      // 2. Select the newly cloned template and switch to target profile
      setSelectedTemplateId(newTemplateId);
      if (params.targetProfileId) {
        setSelectedProfileId(params.targetProfileId);
      }

      // 3. Persist to Firestore
      const res = await saveTemplateToFirestore(tenant.id, clonedTemplate);
      if (!res.success) {
        console.warn('Firestore template save warning:', res.error);
      }

      // 4. Notify parent
      if (onSaveTemplate) {
        await onSaveTemplate(clonedTemplate);
      }

      setIsCloneModalOpen(false);
      setSuccessMessage(`تم استنساخ التصميم بنجاح وتطبيقه على "${params.newTemplateName}"!`);
      setTimeout(() => setSuccessMessage(null), 4500);
    } catch (err: any) {
      console.error('Error cloning template:', err);
      alert(err?.message || 'حدث خطأ أثناء استنساخ القالب');
    } finally {
      setIsCloningTemplate(false);
    }
  };

  // View state
  const [scriptFlavor, setScriptFlavor] = useState<'hotspot_v7' | 'hotspot_v6' | 'userman_v7' | 'userman_v6'>('hotspot_v7');
  const [previewMode, setPreviewMode] = useState<'a4' | 'single' | 'designer'>('a4');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [isSavingBatch, setIsSavingBatch] = useState<boolean>(false);
  const [batchSaveError, setBatchSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

  // MikroTik REST API Auto-Injection Pipeline State
  const [injectionAudit, setInjectionAudit] = useState<MikroTikInjectionAudit | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [enableSimulationMode, setEnableSimulationMode] = useState<boolean>(false);
  const [copiedAuditScript, setCopiedAuditScript] = useState<boolean>(false);

  // Active profile
  const selectedProfile = useMemo(() => {
    if (safeProfiles.length === 0) {
      return {
        id: 'prof_default',
        tenantId: tenantId,
        name: 'باقة 1 جيجا (افتراضي)',
        price: 500,
        wholesalePrice: 450,
        rateLimit: '5M/2M',
        uptimeDisplay: '24 ساعة',
        byteDisplay: '1 جيجابايت',
        uptimeLimit: '24h',
        byteLimit: '1073741824'
      } as Profile;
    }
    return safeProfiles.find(p => p.id === selectedProfileId) || safeProfiles[0];
  }, [safeProfiles, selectedProfileId, tenantId]);

  // Generate live sample cards for preview
  const previewBatchData = useMemo(() => {
    if (!selectedProfile) return { batch: null, cards: [] };
    return generateBatchCards({
      tenant,
      profile: selectedProfile,
      quantity,
      prefix,
      codeLength,
      codeCharSet,
      passwordType,
      templateId: currentTemplate.id
    });
  }, [tenant, selectedProfile, quantity, prefix, codeLength, codeCharSet, passwordType, currentTemplate.id]);

  const activeCards = previewBatchData.cards;
  const sampleCard: Card = activeCards[0] || {
    id: 'sample_01',
    tenantId: tenantId,
    batchId: 'batch_sample',
    batchNumber: 'B-SAMPLE',
    code: '784921',
    password: 'PIN-1024',
    profileId: selectedProfile?.id || 'prof_1',
    profileName: selectedProfile?.name || '1 جيجا - 24 ساعة',
    rateLimit: selectedProfile?.rateLimit || '5M/2M',
    uptimeDisplay: selectedProfile?.uptimeDisplay || '24 ساعة',
    byteDisplay: selectedProfile?.byteDisplay || '1 جيجابايت',
    price: selectedProfile?.price || 500,
    wholesalePrice: selectedProfile?.wholesalePrice || 450,
    status: 'in_stock',
    qrData: 'http://10.0.0.1/login?username=784921',
    createdAt: new Date().toISOString(),
    syncedToRouter: false
  };

  // Custom template updates
  const handleUpdateTemplate = (updates: Partial<CardTemplate>) => {
    setTemplates(prev =>
      prev.map(t => (t.id === currentTemplate.id ? { ...t, ...updates } : t))
    );
    setIsSavedInFirestore(false);
  };

  // Export PDF
  const handleDownloadPdf = async () => {
    if (activeCards.length === 0) return;
    setIsGeneratingPdf(true);
    const totalPages = Math.ceil(activeCards.length / ((currentTemplate.cardsPerRow || 3) * (currentTemplate.cardsPerCol || 8)));
    setPdfProgress({ current: 1, total: totalPages });
    try {
      const blob = await generateCardsPdf(activeCards, currentTemplate, tenant, (current, total) => {
        setPdfProgress({ current, total });
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NetFlow_Cards_${selectedProfile?.name || 'Batch'}_${quantity}cards.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccessMessage(`تم توليد وتنزيل ملف PDF بنجاح (${quantity} كرت في ${totalPages} صفحة A4 عالية الدقة)!`);
      setTimeout(() => setSuccessMessage(null), 4500);
    } catch (err) {
      console.error('PDF generation error', err);
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(null);
    }
  };

  // Direct Print
  const handleDirectPrint = () => {
    window.print();
  };

  // Export Card Sample as Image (PNG 300 DPI)
  const handleExportCardAsImage = async () => {
    setIsExportingImage(true);
    setShowImageExportDropdown(false);
    try {
      const cleanName = (currentTemplate.name || 'Card').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
      const cardToExport = activeCards[0] || (sampleCard as Card);
      const success = await exportCardWithFallback({
        card: cardToExport,
        template: currentTemplate,
        tenant,
        elementOrId: 'universal-card-export-target',
        fileName: `NetFlow_${cleanName}_Card.png`,
        scale: 3
      });
      if (success) {
        setSuccessMessage('تم حفظ الكرت كصورة عالية الدقة (300 DPI) على جهازك بنجاح!');
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error('Failed to export card image:', err);
      alert('حدث خطأ أثناء حفظ الصورة. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsExportingImage(false);
    }
  };

  // Export Template Blank Background as Image (for print houses)
  const handleExportBackgroundAsImage = async () => {
    setIsExportingImage(true);
    setShowImageExportDropdown(false);
    try {
      const cleanName = (currentTemplate.name || 'Template').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
      const success = await exportTemplateBackgroundAsPng(currentTemplate, `NetFlow_${cleanName}_Blank_Background.png`);
      if (success) {
        setSuccessMessage('تم حفظ خلفية القالب كصورة فارغة للمطابع بدقة فائقة على جهازك بنجاح!');
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error('Failed to export background image:', err);
      alert('حدث خطأ أثناء حفظ خلفية القالب.');
    } finally {
      setIsExportingImage(false);
    }
  };

  // Batch Save Success Modal State
  const [savedBatchData, setSavedBatchData] = useState<{
    batch: CardBatch;
    cards: Card[];
    script: string;
    profileName: string;
    quantity: number;
    price: number;
    totalValue: number;
  } | null>(null);
  const [isSavedBatchModalOpen, setIsSavedBatchModalOpen] = useState<boolean>(false);
  const [copiedBatchModalScript, setCopiedBatchModalScript] = useState<boolean>(false);
  const [copiedChunkIndex, setCopiedChunkIndex] = useState<number | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);
  const [downloadedPartIndex, setDownloadedPartIndex] = useState<number | null>(null);

  const savedBatchSplitPackage = useMemo(() => {
    if (!savedBatchData?.cards || savedBatchData.cards.length === 0) return null;
    return generateSplitRouterOSScripts(
      savedBatchData.cards,
      savedBatchData.profileName,
      savedBatchData.batch.batchNumber || "B-101",
      250,
      scriptFlavor
    );
  }, [savedBatchData, scriptFlavor]);

  // Save batch into Inventory & Cloud Firestore cleanly (without blocking on MikroTik router)
  const handleSaveToInventory = async () => {
    if (!previewBatchData.batch || isSavingBatch) return;
    setIsSavingBatch(true);
    setBatchSaveError(null);
    setSuccessMessage(null);

    try {
      const activeRouterToken = tenant.settings?.syncToken || 'sam_sec_89df24a67e12c4';
      const batchId = previewBatchData.batch.id;
      const rawBatchNum = previewBatchData.batch.batchNumber || "101";
      
      let cleanBatchStr = String(rawBatchNum).replace(/^NetFlow[-_]?/i, "").trim();
      if (cleanBatchStr.toLowerCase().startsWith("b-")) {
        cleanBatchStr = cleanBatchStr.substring(2);
      } else if (cleanBatchStr.toLowerCase().startsWith("b")) {
        cleanBatchStr = cleanBatchStr.substring(1);
      }
      const batchComment = sanitizeRouterOSComment(`NetFlow-B-${cleanBatchStr || "101"}`);

      const formattedBytes = formatByteLimit(selectedProfile?.byteLimit || previewBatchData.cards[0]?.byteDisplay) || "2700M";

      // Transform cards to strictly adhere to profile limits and RouterOS compatibility
      const formattedCards = previewBatchData.cards.map(c => {
        const uName = c.code;
        const pwd = c.password || c.code;
        const prof = 'default';

        return {
          ...c,
          username: uName,
          password: pwd,
          profile: prof,
          limitBytesTotal: formattedBytes,
          limitUptime: selectedProfile?.uptimeLimit || '',
          comment: batchComment
        };
      });

      const batchToSave: CardBatch = {
        ...previewBatchData.batch,
        id: batchId,
        batchId: batchId,
        batchNumber: `B-${cleanBatchStr || "101"}`,
        tenantId: tenant.id,
        routerToken: activeRouterToken,
        status: 'pending',
        synced: false,
        cards: formattedCards,
        createdAt: new Date().toISOString()
      };

      // 1. Persist to inventory and cloud Firestore
      await onBatchSaved(batchToSave, previewBatchData.cards);

      // 2. Prepare the RouterOS batch script
      const script = getMikroTikScript(scriptFlavor, previewBatchData.cards, selectedProfile?.name);

      // 3. Open the Batch Saved & Script Modal
      setSavedBatchData({
        batch: batchToSave,
        cards: previewBatchData.cards,
        script,
        profileName: selectedProfile?.name || 'باقة غير محددة',
        quantity: previewBatchData.cards.length,
        price: selectedProfile?.price || 0,
        totalValue: (previewBatchData.cards.length) * (selectedProfile?.price || 0)
      });
      setIsSavedBatchModalOpen(true);

      setSuccessMessage(`تم إنشاء وحفظ الدفعة (${batchToSave.batchNumber}) بعدد ${previewBatchData.cards.length} كرت بنجاح في المخزن.`);
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      console.error('Error saving batch to inventory:', err);
      setBatchSaveError(err?.message || 'فشل حفظ الدفعة في المخزن. يرجى التأكد من البيانات والمحاولة مجدداً.');
      setTimeout(() => setBatchSaveError(null), 7000);
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Re-run injection pipeline directly from audit modal (e.g. toggle simulation or retry)
  const handleRerunInjection = async (forceSim: boolean) => {
    if (!previewBatchData.batch || isSavingBatch) return;
    setIsSavingBatch(true);
    try {
      const rawBatchNum = previewBatchData.batch.batchNumber || previewBatchData.batch.id || "001";
      let cleanBatchStr = String(rawBatchNum).replace(/^NetFlow[-_]?/i, "").trim();
      if (cleanBatchStr.toLowerCase().startsWith("b-")) {
        cleanBatchStr = cleanBatchStr.substring(2);
      } else if (cleanBatchStr.toLowerCase().startsWith("b")) {
        cleanBatchStr = cleanBatchStr.substring(1);
      }
      const batchComment = sanitizeRouterOSComment(`NetFlow-B-${cleanBatchStr || "001"}`);
      const formattedBytes = formatByteLimit(selectedProfile?.byteLimit || previewBatchData.cards[0]?.byteDisplay) || "2700M";

      const routerConfig = {
        host: tenant.settings?.apiHost || tenant.settings?.routerIp || '10.0.0.1',
        port: tenant.settings?.apiPort || 8081,
        username: tenant.settings?.apiUser || 'mosthassan',
        password: tenant.settings?.apiPassword || '',
        useHttps: tenant.settings?.apiPort === 443,
        timeoutMs: 4000,
        mockSimulation: forceSim
      };

      const injectRes = await fetch('/api/mikrotik/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: batchComment,
          cards: previewBatchData.cards.map(c => ({
            name: c.code,
            password: c.password || c.code,
            profile: 'default',
            limitBytesTotal: formattedBytes,
            comment: batchComment
          })),
          routerConfig
        })
      });

      const auditData: MikroTikInjectionAudit = await injectRes.json();
      setInjectionAudit(auditData);
      setEnableSimulationMode(forceSim);
    } catch (err: any) {
      console.error('Failed to rerun injection:', err);
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (activeCards.length === 0) return;
    const headers = ['Code,Password,Profile,Price,WholesalePrice,Uptime,ByteLimit,QR_Login_URL\n'];
    const rows = activeCards.map(c => 
      `"${c.code}","${c.password || ''}","${c.profileName}",${c.price},${c.wholesalePrice},"${c.uptimeDisplay}","${c.byteDisplay}","${c.qrData}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + headers.concat(rows.join('\n'));
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NetFlow_Cards_${selectedProfile?.name || 'Export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // MikroTik Script Generator by flavor (Direct Data Binding to in-memory cards without global store query/merge)
  const getMikroTikScript = (flavor: string, cards: Card[], profileName?: string) => {
    return generateRscScript(cards, profileName, flavor as any);
  };

  // Copy MikroTik Script
  const handleCopyMikroTikScript = async () => {
    if (activeCards.length === 0) {
      alert('لا توجد كروت جاهزة حالياً لنسخ السكربت!');
      return;
    }
    const script = getMikroTikScript(scriptFlavor, activeCards, selectedProfile?.name);
    const success = await copyTextToClipboard(script);
    if (success) {
      setCopiedScript(true);
      const flavorName = 
        scriptFlavor === 'hotspot_v7' ? 'RouterOS v7 Hotspot' :
        scriptFlavor === 'hotspot_v6' ? 'RouterOS v6 Hotspot' :
        scriptFlavor === 'userman_v7' ? 'User Manager v7' : 'User Manager v6';
      setSuccessMessage(`تم نسخ أوامر وسكريبت المايكروتك بنجاح (${flavorName}) لعدد ${activeCards.length} كرت!`);
      setTimeout(() => {
        setCopiedScript(false);
        setSuccessMessage(null);
      }, 3500);
    } else {
      alert('تعذر النسخ التلقائي للحافظة. يمكنك استخدام زر "تنزيل ملف .rsc" للحصول على الملف مباشرة.');
    }
  };

  // Download .rsc file for MikroTik (Direct Data Binding: strictly using in-memory previewBatchData.cards)
  const handleDownloadRsc = () => {
    const currentCards = previewBatchData?.cards || activeCards;
    if (!currentCards || currentCards.length === 0) {
      alert('لا توجد كروت جاهزة للتنزيل!');
      return;
    }
    // Direct Data Binding: Takes previewBatchData.cards DIRECTLY from current local generation instance
    // DO NOT pull, merge, or query existing/old vouchers from global store or persistent database
    const res = downloadRsc(currentCards, selectedProfile?.name, scriptFlavor);
    if (res.success) {
      setSuccessMessage(`تم تنزيل ملف أوامر المايكروتك (${scriptFlavor}) الموحد بعدد ${res.count} كرت بالتمام بنجاح!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner & Quick Metrics */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                استوديو التصميم الذكي للطباعة
              </span>
              <span className="text-slate-400 text-xs">• دقة الطباعة A4 المليمترية</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              توليد وتصميم كروت الإنترنت وطباعتها
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-slate-400 text-sm">
                توليد وطباعة الكروت، وتخصيص قوالب الباقات وحفظها سحابياً لمزامنتها في أي وقت.
              </p>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/80 border border-slate-700/80 rounded-lg text-xs">
                <span className="text-slate-400">القالب النشط:</span>
                <strong className="text-amber-300 font-bold">{currentTemplate.name}</strong>
                {currentTemplate.isCustom && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded-full font-bold">
                    💎 سحابي
                  </span>
                )}
                {currentTemplate.linkedProfileName && (
                  <span className="text-[10px] text-sky-300 bg-sky-950 border border-sky-800 px-1.5 py-0.2 rounded-full font-mono">
                    باقة: {currentTemplate.linkedProfileName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Save Template Modal Trigger */}
            <button
              id="topbar-save-template-btn"
              type="button"
              onClick={() => handleOpenSaveModal(currentTemplate.isCustom ? 'update' : 'new')}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 rounded-xl font-bold shadow-lg shadow-amber-950/30 transition transform active:scale-95 text-sm cursor-pointer"
              title="تسمية وحفظ هذا القالب للباقة وتخزينه سحابياً"
            >
              <BookmarkPlus className="w-4 h-4 text-slate-950" />
              <span>{currentTemplate.isCustom ? 'تحديث / حفظ باسم' : 'حفظ وتسمية القالب'}</span>
            </button>

            <button
              id="save-batch-btn"
              onClick={handleSaveToInventory}
              disabled={isSavingBatch}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/30 transition transform active:scale-95 text-sm cursor-pointer disabled:cursor-not-allowed"
            >
              {isSavingBatch ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              <span>{isSavingBatch ? 'جاري الحفظ في المخزن...' : 'حفظ الدفعة في المخزن'}</span>
            </button>

            {/* Quick MikroTik Script Action Buttons */}
            <button
              id="copy-script-top-btn"
              type="button"
              onClick={handleCopyMikroTikScript}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 rounded-xl font-bold transition transform active:scale-95 text-xs cursor-pointer"
              title="نسخ سكربت الأوامر لتشغيله في Terminal مايكروتك"
            >
              <Terminal className="w-4 h-4 text-sky-400" />
              <span>{copiedScript ? 'تم النسخ! ✓' : 'سكربت الدفعة'}</span>
            </button>

            <button
              id="download-rsc-top-btn"
              type="button"
              onClick={handleDownloadRsc}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 rounded-xl font-bold transition transform active:scale-95 text-xs cursor-pointer"
              title="تنزيل ملف .rsc لحقنه لاحقاً في المايكروتك"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>ملف .rsc</span>
            </button>

            <button
              id="download-pdf-btn"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-sky-900/30 transition transform active:scale-95 text-sm"
            >
              {isGeneratingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {isGeneratingPdf
                ? (pdfProgress ? `صفحة ${pdfProgress.current} من ${pdfProgress.total}...` : 'جاري إنشاء PDF...')
                : `تحميل PDF (${quantity} كرت)`}
            </button>

            <button
              id="direct-print-btn"
              onClick={handleDirectPrint}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600/60 rounded-xl font-semibold transition text-sm"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              طباعة
            </button>

            {/* Save As Image Dropdown */}
            <div className="relative">
              <button
                id="save-image-dropdown-btn"
                type="button"
                onClick={() => setShowImageExportDropdown(!showImageExportDropdown)}
                disabled={isExportingImage}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-950/40 transition transform active:scale-95 text-sm"
                title="حفظ القالب أو الكرت كصورة عالية الدقة PNG على جهازك"
              >
                {isExportingImage ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Camera className="w-4 h-4 text-indigo-200" />
                )}
                <span>حفظ كصورة 🖼️</span>
              </button>

              {showImageExportDropdown && (
                <div className="absolute left-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in space-y-1">
                  <button
                    type="button"
                    onClick={handleExportCardAsImage}
                    className="w-full p-2.5 rounded-xl hover:bg-slate-800 text-right flex items-center gap-2.5 transition text-xs text-slate-200 font-bold"
                  >
                    <Camera className="w-4 h-4 text-sky-400 shrink-0" />
                    <div>
                      <div>حفظ كرت العينة كصورة (PNG)</div>
                      <div className="text-[10px] text-slate-400 font-normal">كرت كامل بالبيانات والكود 300 DPI</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportBackgroundAsImage}
                    className="w-full p-2.5 rounded-xl hover:bg-slate-800 text-right flex items-center gap-2.5 transition text-xs text-slate-200 font-bold"
                  >
                    <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div>حفظ خلفية القالب فارغة (PNG)</div>
                      <div className="text-[10px] text-slate-400 font-normal">خلفية بدون بيانات مناسبة للمطابع</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live PDF Progress Bar */}
        {isGeneratingPdf && pdfProgress && (
          <div className="mt-4 p-3 bg-sky-950/80 border border-sky-500/40 rounded-xl space-y-1.5 animate-in fade-in">
            <div className="flex justify-between text-xs text-sky-200 font-bold">
              <span>جاري رندرة وتوليد صفحات الطباعة بدقة 300 DPI عالية الوضوح...</span>
              <span className="font-mono">صفحة {pdfProgress.current} من {pdfProgress.total} ({Math.round((pdfProgress.current / pdfProgress.total) * 100)}%)</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-sky-500 h-2 transition-all duration-150 ease-out"
                style={{ width: `${Math.round((pdfProgress.current / pdfProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Batch Save Error Alert */}
        {batchSaveError && (
          <div className="mt-4 p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{batchSaveError}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}
      </div>

      {/* Main Studio Grid: Controls (Left/Right) & Live Canvas/Sheet Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tabbed Studio Control Panel (5 Cols) */}
        <div className="lg:col-span-5">
          <StudioControlPanel
            tenant={tenant}
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            setSelectedProfileId={setSelectedProfileId}
            selectedProfile={selectedProfile}
            onUpdateProfiles={onUpdateProfiles}
            quantity={quantity}
            setQuantity={setQuantity}
            prefix={prefix}
            setPrefix={setPrefix}
            codeLength={codeLength}
            setCodeLength={setCodeLength}
            codeCharSet={codeCharSet}
            setCodeCharSet={setCodeCharSet}
            passwordType={passwordType}
            setPasswordType={setPasswordType}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            setSelectedTemplateId={setSelectedTemplateId}
            currentTemplate={currentTemplate}
            handleUpdateTemplate={handleUpdateTemplate}
            handleSaveTemplateToFirestore={handleSaveTemplateToFirestore}
            isSavingToFirestore={isSavingToFirestore}
            isSavedInFirestore={isSavedInFirestore}
            onOpenSaveModal={handleOpenSaveModal}
            onOpenCloneModal={handleOpenCloneModal}
            onDeleteCustomTemplate={handleDeleteCustomTemplate}
            aiPrompt={aiPrompt}
            setAiPrompt={setAiPrompt}
            isGeneratingAiTemplate={isGeneratingAiTemplate}
            aiGenerationStep={aiGenerationStep}
            aiError={aiError}
            setAiError={setAiError}
            handleGenerateAiTemplate={handleGenerateAiTemplate}
            fileInputRef={fileInputRef}
            isDragging={isDragging}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            handleFileUpload={handleFileUpload}
            handleRemoveCustomTemplate={handleRemoveCustomTemplate}
            activeCards={activeCards}
            scriptFlavor={scriptFlavor}
            setScriptFlavor={setScriptFlavor}
            copiedScript={copiedScript}
            handleCopyMikroTikScript={handleCopyMikroTikScript}
            handleDownloadRsc={handleDownloadRsc}
            handleExportCsv={handleExportCsv}
            onExportCardImage={handleExportCardAsImage}
            onExportBackgroundImage={handleExportBackgroundAsImage}
            isExportingImage={isExportingImage}
            previewMode={previewMode}
            setPreviewMode={setPreviewMode}
          />
        </div>

        {/* Right Column: Live Interactive Preview (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Preview Mode Switcher & Tools */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 shadow-md">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-bold text-white">المعاينة الحية للكروت</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                id="preview-a4-btn"
                onClick={() => setPreviewMode('a4')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  previewMode === 'a4'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ورقة A4 كاملة للطباعة
              </button>
              <button
                type="button"
                id="preview-single-btn"
                onClick={() => setPreviewMode('single')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  previewMode === 'single'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                معاينة كرت مفرد
              </button>
              <button
                type="button"
                id="preview-designer-btn"
                onClick={() => setPreviewMode('designer')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  previewMode === 'designer'
                    ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md'
                    : 'text-sky-400 hover:text-sky-300'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>استوديو السحب بالماوس 🖱️</span>
              </button>

              <div className="h-4 w-px bg-slate-800 mx-0.5" />

              <button
                type="button"
                id="preview-quick-export-img-btn"
                onClick={handleExportCardAsImage}
                disabled={isExportingImage}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-300 hover:text-white bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/40 transition disabled:opacity-50"
                title="تنزيل الكرت كصورة PNG عالية الدقة"
              >
                {isExportingImage ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>حفظ كصورة</span>
              </button>
            </div>
          </div>

          {/* Render Area */}
          {previewMode === 'designer' ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 shadow-inner">
              {activeCards[0] && (
                <InteractiveCardCanvas
                  card={activeCards[0]}
                  template={currentTemplate}
                  tenant={tenant}
                  onUpdateTemplate={handleUpdateTemplate}
                />
              )}
            </div>
          ) : previewMode === 'single' ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[480px] shadow-inner">
              <div className="mb-4 text-center">
                <span className="text-xs text-slate-400 font-medium">
                  المقاس الواقعي: {currentTemplate.cardWidthMm || 63} مم × {currentTemplate.cardHeightMm || 33} مم (A4 Grid {(currentTemplate.cardsPerRow || 3)}×{(currentTemplate.cardsPerCol || 8)} = {(currentTemplate.cardsPerRow || 3) * (currentTemplate.cardsPerCol || 8)} كرت/ورقة)
                </span>
              </div>
              {activeCards[0] && (
                <div id="main-card-preview-container" className="flex justify-center w-full">
                  <CardPreview
                    id="main-card-preview-element"
                    card={activeCards[0]}
                    template={currentTemplate}
                    tenant={tenant}
                    isZoomed={true}
                  />
                </div>
              )}
            </div>
          ) : (
            <A4SheetPreview
              cards={activeCards}
              template={currentTemplate}
              tenant={tenant}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          )}

          {/* Universal export element for 100% reliable image export in any preview mode (A4, Single, Designer) */}
          {(activeCards[0] || sampleCard) && (
            <div
              id="universal-card-export-wrapper"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '380px',
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -9999
              }}
              aria-hidden="true"
            >
              <CardPreview
                id="universal-card-export-target"
                card={activeCards[0] || (sampleCard as Card)}
                template={currentTemplate}
                tenant={tenant}
                isZoomed={true}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modal for Naming and Saving Custom Template to Cloud */}
      {isNamingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-3xl shadow-2xl overflow-hidden text-right"
            dir="rtl"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-600/20 via-slate-800 to-slate-900 border-b border-slate-800 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <BookmarkPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    حفظ وتسمية قالب الكرت (مزامنة سحابية)
                  </h3>
                  <p className="text-xs text-slate-400">
                    احفظ التنسيق والألوان بالاسم الذي تريده لترجع له بنقرة واحدة في أي وقت
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNamingModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* If updating existing custom template, offer choice */}
              {currentTemplate.isCustom && (
                <div className="flex items-center gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSaveAsMode('update');
                      setCustomTemplateName(currentTemplate.name);
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold transition cursor-pointer ${
                      saveAsMode === 'update'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    تحديث القالب الحالي (&quot;{currentTemplate.name}&quot;)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveAsMode('new');
                      setCustomTemplateName(`${currentTemplate.name} (نسخة)`);
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold transition cursor-pointer ${
                      saveAsMode === 'new'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    حفظ كقالب جديد باسم مختلف
                  </button>
                </div>
              )}

              {/* Template Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span>اسم القالب المميز:</span>
                  <span className="text-[11px] text-amber-400 font-normal">مثال: قالب كرت أبو 200</span>
                </label>
                <input
                  type="text"
                  id="custom-template-name-input"
                  value={customTemplateName}
                  onChange={(e) => setCustomTemplateName(e.target.value)}
                  placeholder="مثال: قالب كرت أبو 200 أو قالب VIP سرعة عالية..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition"
                  autoFocus
                />
              </div>

              {/* Quick Suggestion Chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400">اقتراحات سريعة للأسماء:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedProfile && (
                    <button
                      type="button"
                      onClick={() => setCustomTemplateName(`قالب كرت باقة ${selectedProfile.name}`)}
                      className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition cursor-pointer"
                    >
                      قالب كرت باقة {selectedProfile.name}
                    </button>
                  )}
                  {selectedProfile?.price && (
                    <button
                      type="button"
                      onClick={() => setCustomTemplateName(`قالب كرت أبو ${selectedProfile.price}`)}
                      className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition cursor-pointer"
                    >
                      قالب كرت أبو {selectedProfile.price}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCustomTemplateName('قالب كرت VIP فايبر')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  >
                    قالب كرت VIP فايبر
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomTemplateName('قالب كرت سهرة موفر')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  >
                    قالب كرت سهرة موفر
                  </button>
                </div>
              </div>

              {/* Link with Profile / Package (Optional) */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span>ربط القالب بباقة معينة (مزامنة تلقائية):</span>
                  <span className="text-[10px] text-slate-400">سيتم تفعيله فور اختيار هذه الباقة</span>
                </label>
                <select
                  value={templateLinkedProfileId}
                  onChange={(e) => setTemplateLinkedProfileId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition font-sans"
                >
                  <option value="">-- قالب عام (متاح لكل الباقات) --</option>
                  {(safeProfiles || []).map(p => (
                    <option key={p.id} value={p.id}>
                      ربط بباقة: {p.name} (سعر {p.price} {tenant?.currency || 'ر.ي'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Template Specs Preview */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-300">
                  <span>توزيع الورقة:</span>
                  <span className="font-mono text-amber-400">
                    {currentTemplate.cardsPerRow} × {currentTemplate.cardsPerCol} = {currentTemplate.cardsPerRow * currentTemplate.cardsPerCol} كرت في صفحة A4
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>نوع الرمز:</span>
                  <span className="text-sky-300">
                    {currentTemplate.qrType === 'login_url' ? 'رابط تسجيل الدخول' : currentTemplate.qrType === 'pin_code' ? 'رمز PIN' : currentTemplate.qrType === 'code_only' ? 'كود الكرت' : 'نص مخصص'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>حالة التخزين:</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <Cloud className="w-3.5 h-3.5" />
                    <span>تخزين سحابي مباشر ومحلي دائم</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-950/90 border-t border-slate-800 p-4 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsNamingModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="confirm-save-custom-template-btn"
                onClick={handleSaveCustomNamedTemplate}
                disabled={isSavingCustomTemplate || !customTemplateName.trim()}
                className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 text-xs font-black rounded-xl transition shadow-lg shadow-amber-950/40 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingCustomTemplate ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                    <span>جاري الحفظ في السحابة...</span>
                  </>
                ) : (
                  <>
                    <BookmarkCheck className="w-4 h-4 text-slate-950" />
                    <span>حفظ القالب سحابياً الآن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone & Reuse Template across Categories / Profiles Modal */}
      <CloneTemplateModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        templates={templates}
        currentTemplate={currentTemplate}
        initialSourceTemplateId={cloneSourceTemplateId}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        tenant={tenant}
        onConfirmClone={handleConfirmClone}
        isCloning={isCloningTemplate}
      />

      {/* Batch Saved to Inventory & MikroTik Script (.rsc) Modal */}
      {isSavedBatchModalOpen && savedBatchData && (
        <div
          id="batch-saved-inventory-modal"
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 p-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">
                      تم إنشاء وحفظ الدفعة في المخزن بنجاح 📦
                    </h3>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 text-emerald-400 border border-emerald-700/60">
                      {savedBatchData.batch.batchNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    الكروت مودعة الآن في المخزن المحلي والسحابي، وجاهزة للطباعة والتوزيع والحقن
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="close-batch-saved-modal-btn"
                onClick={() => setIsSavedBatchModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Core Precision Metrics (User Request: عدم نقص وعدم تداخل فئات) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-slate-400 mb-1">فئة الباقة</div>
                  <div className="text-sm font-bold text-sky-300 truncate" title={savedBatchData.profileName}>
                    {savedBatchData.profileName}
                  </div>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-emerald-400/90 mb-1">عدد الكروت بالتمام</div>
                  <div className="text-lg font-black text-emerald-300 font-mono">
                    {savedBatchData.quantity} <span className="text-xs font-normal">كرت</span>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-slate-400 mb-1">سعر الكرت</div>
                  <div className="text-sm font-bold text-amber-300 font-mono">
                    {savedBatchData.price} ريال
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-slate-400 mb-1">إجمالي القيمة</div>
                  <div className="text-sm font-bold text-purple-300 font-mono">
                    {savedBatchData.totalValue.toLocaleString()} ريال
                  </div>
                </div>
              </div>

              {/* Accuracy & Isolation Guarantee Notice */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-emerald-300">
                    دقة 100% في التوليد وعزل فئات الكروت:
                  </p>
                  <p className="text-emerald-200/80 leading-relaxed">
                    تم توليد عدد <strong>{savedBatchData.quantity}</strong> كرت دون أي نقص، بأكواد مشفرة فريدة لا تتكرر ولا تتداخل مع أي دفعة أو فئة سابقة، مع ربطها المباشر بحصص وسرعة باقة <strong>{savedBatchData.profileName}</strong>.
                  </p>
                </div>
              </div>

              {/* MikroTik Script & RSC Injection Section */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold text-white">سكربت المايكروتك لدفعة الكروت (MikroTik Script)</span>
                  </div>
                  <span className="text-[10px] font-mono bg-sky-950/60 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded-full">
                    {scriptFlavor}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  يمكنك نسخ السكربت ولصقه مباشرة في تيرمينال المايكروتك (New Terminal)، أو تنزيل ملف <strong>.rsc</strong> واستيراده في أي وقت عبر الأمر: <code className="bg-slate-900 text-sky-300 px-1 py-0.5 rounded font-mono">/import file-name=netflow_cards.rsc</code>
                </p>

                {/* Script snippet preview */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300 max-h-24 overflow-y-auto ltr text-left dir-ltr">
                  <pre className="whitespace-pre-wrap">{savedBatchData.script.split('\n').slice(0, 6).join('\n')}
{savedBatchData.script.split('\n').length > 6 ? `\n# ... +${savedBatchData.script.split('\n').length - 6} أسطر أوامر إضافية للكروت` : ''}</pre>
                </div>

                {/* WinBox File Editor Buffer Notice & Terminal Limits */}
                <div className="bg-sky-950/40 border border-sky-500/40 rounded-xl p-4 text-xs text-sky-200/90 space-y-2.5">
                  <div className="font-bold text-sky-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>كشف وتوضيح تقني: سبب توقف عارض WinBox عند الكرت 286</span>
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold">
                      الدفعة كاملة: {savedBatchData.quantity} كرت
                    </span>
                  </div>
                  
                  <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg text-slate-300 space-y-2 leading-relaxed">
                    <p>
                      <strong>لماذا ترى 286 كرت فقط عند فتح الملف داخل WinBox؟</strong><br />
                      عارض ومحرر الملفات الداخلي في برنامج WinBox (<code className="text-sky-300">Files &gt; Edit</code>) يمتلك <strong>سعة ذاكرة عرض ثابتة (Buffer Limit بحجم 42 كيلوبايت)</strong>، لذلك يتوقف عن إظهار الأسطر بعد الكرت 286 تلقائياً.
                    </p>
                    <p className="text-emerald-300 font-medium">
                      ✓ <strong>الملف الفعلي يحتوي على كامل الـ {savedBatchData.quantity} كرت بدون أي نقص إطلاقاً!</strong><br />
                      يمكنك التأكد فوراً بفتح الملف المنزّل على جهاز الكمبيوتر باستخدام برنامج <strong>المفكرة (Notepad)</strong> أو <strong>VS Code</strong>، وستجد كافة الكروت حتى آخر سطر مع سطر الفحص النهائي <code className="text-emerald-400 font-mono text-[11px]">(# End of Script | Total: {savedBatchData.quantity})</code>.
                    </p>
                  </div>

                  {/* Multi-Part Solutions */}
                  {savedBatchSplitPackage && savedBatchSplitPackage.isLargeBatch && (
                    <div className="pt-2 border-t border-sky-900/50 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <FolderDown className="w-3.5 h-3.5 text-amber-400" />
                          ملفات مجزأة متوافقة 100% مع عارض ومحرر WinBox (250 كرت لكل جزء - حجم 36KB):
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {savedBatchSplitPackage.parts.length} أجزاء آمنة
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-normal">
                        إذا كنت ترغب بفتح الملفات وقراءتها والتعديل عليها مباشرة من داخل عارض ملفات Winbox دون أي اقتطاع، قمنا بتجزئتها إلى أجزاء حجم كل منها أقل من 38KB:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {savedBatchSplitPackage.parts.map((part) => {
                          const isPartDownloaded = downloadedPartIndex === part.partIndex;
                          return (
                            <button
                              key={part.partIndex}
                              type="button"
                              onClick={() => {
                                const blob = new Blob([part.script], { type: 'text/plain;charset=utf-8' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = part.fileName;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                setDownloadedPartIndex(part.partIndex);
                                setTimeout(() => setDownloadedPartIndex(null), 2500);
                              }}
                              className={`p-2 rounded-lg text-xs font-mono font-bold transition flex items-center justify-between border cursor-pointer ${
                                isPartDownloaded
                                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-right">
                                <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="font-sans text-[11px]">الجزء {part.partIndex} ({part.startRange} إلى {part.endRange})</span>
                              </div>
                              <span className="text-[10px] text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 font-sans">
                                {isPartDownloaded ? 'تم التنزيل ✓' : `${part.cardsCount} كرت (~36KB)`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Terminal Import One-Liner */}
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-1.5 text-xs">
                    <span className="font-bold text-slate-300 block">
                      أمر استيراد الدفعة في Terminal مايكروتك بعد رفع الملف لقائمة Files:
                    </span>
                    <div className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded font-mono text-[11px] text-emerald-400 ltr text-left">
                      <span className="flex-1 select-all truncate">
                        /import file-name=&quot;netflow_{savedBatchData.batch.batchNumber}_{(savedBatchData.profileName || 'batch').replace(/[^a-zA-Z0-9_\u0621-\u064A]/g, '_')}_all_{savedBatchData.quantity}cards.rsc&quot;
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const cmd = `/import file-name="netflow_${savedBatchData.batch.batchNumber}_${(savedBatchData.profileName || 'batch').replace(/[^a-zA-Z0-9_\u0621-\u064A]/g, '_')}_all_${savedBatchData.quantity}cards.rsc"`;
                          await copyTextToClipboard(cmd);
                          alert('تم نسخ أمر الاستيراد للمايكروتك!');
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] shrink-0 font-sans cursor-pointer"
                      >
                        نسخ الأمر
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chunked Copy Buttons (Safe Terminal Pasting) */}
                {savedBatchData.cards.length > 50 && (
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                        نسخ مجزأ للتيرمينال (100 كرت لكل جزء لمنع اقتطاع الذاكرة):
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {chunkCards(savedBatchData.cards, 100).length} أجزاء
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-slate-900 rounded-lg border border-slate-800">
                      {chunkCards(savedBatchData.cards, 100).map((chunk, idx) => {
                        const startIdx = idx * 100 + 1;
                        const endIdx = startIdx + chunk.length - 1;
                        const isCopied = copiedChunkIndex === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={async () => {
                              const chunkScript = getMikroTikScript(scriptFlavor, chunk, savedBatchData.profileName);
                              await copyTextToClipboard(chunkScript);
                              setCopiedChunkIndex(idx);
                              setTimeout(() => setCopiedChunkIndex(null), 2500);
                            }}
                            className={`px-2 py-1.5 rounded text-[11px] font-mono font-bold transition flex items-center justify-center gap-1 cursor-pointer border ${
                              isCopied
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                            }`}
                          >
                            {isCopied ? 'تم النسخ ✓' : `الجزء ${idx + 1} (${startIdx}-${endIdx})`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Instant Action Download Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await copyTextToClipboard(savedBatchData.script);
                      setCopiedBatchModalScript(true);
                      setTimeout(() => setCopiedBatchModalScript(false), 3000);
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition transform active:scale-95 cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-sky-400" />
                    <span>{copiedBatchModalScript ? 'تم نسخ السكربت! ✓' : 'نسخ السكربت للحافظة'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const cleanProf = (savedBatchData.profileName || 'batch').replace(/[^a-zA-Z0-9_\u0621-\u064A]/g, '_');
                      const fileName = `netflow_${savedBatchData.batch.batchNumber}_${cleanProf}_all_${savedBatchData.cards.length}cards.rsc`;
                      downloadRsc(savedBatchData.cards, savedBatchData.profileName, scriptFlavor, fileName);
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition transform active:scale-95 cursor-pointer"
                    title="تنزيل الملف الموحد الذي يحتوي على كامل عدد الكروت بالتمام"
                  >
                    <Download className="w-4 h-4" />
                    <span>تنزيل الملف الموحد ({savedBatchData.cards.length} كرت)</span>
                  </button>

                  {/* Complete ZIP Package with Split parts & instructions */}
                  {savedBatchSplitPackage && (
                    <button
                      type="button"
                      disabled={isDownloadingZip}
                      onClick={async () => {
                        setIsDownloadingZip(true);
                        try {
                          await downloadBatchZipPackage(savedBatchSplitPackage);
                        } finally {
                          setIsDownloadingZip(false);
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition transform active:scale-95 cursor-pointer"
                      title="تنزيل حزمة مايكروتك كاملة ZIP تضم الملف الموحد + أجزاء WinBox + سكربت Master Runner"
                    >
                      {isDownloadingZip ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Archive className="w-4 h-4" />
                      )}
                      <span>{isDownloadingZip ? 'جاري تجهيز ZIP...' : 'حزمة مايكروتك ZIP'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-950/90 border-t border-slate-800 p-4 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                الحالة: <strong className="text-emerald-400 font-bold">مودعة في المخزن</strong>
              </span>
              <button
                type="button"
                id="confirm-close-batch-saved-modal-btn"
                onClick={() => setIsSavedBatchModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition cursor-pointer border border-slate-700"
              >
                إغلاق والعودة للتصميم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardStudio;
