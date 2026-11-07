import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Icon, Select } from '../ui/primitives';
import { legibleHex } from '../ui/primitives/color';
import LoadingSpinner from '../ui/LoadingSpinner';
import {
  fetchCycles,
  fetchDefaultCycle,
  fetchCycleAttendanceReport,
  exportToCSV
} from '../../utils/cycleAttendanceReportService';
import {
  CycleData,
  CycleAttendanceReportData,
  ReportFilters
} from '../../types/ReportTypes';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);
// Charts render on canvas (no CSS vars): use the UI font explicitly
ChartJS.defaults.font.family = 'Saira, system-ui, sans-serif';


interface CycleAttendanceReportProps {
  error: string | null;
  setError: (error: string | null) => void;
}

const CycleAttendanceReport: React.FC<CycleAttendanceReportProps> = ({ error, setError }) => {
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<CycleAttendanceReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>({
    squadronIds: [],
    qualificationIds: [],
    showAttendancePercent: false,
    showAttendanceCount: true,
    showNoShowsPercent: false,
    showNoShowsCount: true,
    showSnivelsPercent: false,
    showSnivelsCount: true,
    showAdvancedSnivelsPercent: false,
    showAdvancedSnivelsCount: true,
    showTotalSnivelsPercent: false,
    showTotalSnivelsCount: false,
    showNoResponsePercent: false,
    showNoResponseCount: false,
    attendanceTrendLine: 'disabled',
    noShowsTrendLine: 'disabled',
    snivelsTrendLine: 'disabled',
    advancedSnivelsTrendLine: 'disabled',
    totalSnivelsTrendLine: 'disabled',
    noResponseTrendLine: 'disabled'
  });

  // Load cycles and set default cycle
  useEffect(() => {
    const loadCycles = async () => {
      try {
        setLoading(true);
        const cyclesData = await fetchCycles();
        setCycles(cyclesData);

        const defaultCycle = await fetchDefaultCycle();
        if (defaultCycle) {
          setSelectedCycleId(defaultCycle.id);
        } else if (cyclesData.length > 0) {
          setSelectedCycleId(cyclesData[0].id);
        } else {
          // No cycles available, stop loading
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading cycles:', err);
        setError('Failed to load cycles');
        setLoading(false);
      }
    };

    loadCycles();
  }, [setError]);

  // Load report data when cycle changes
  const loadReportData = useCallback(async (cycleId: string, reportFilters: ReportFilters) => {
    try {
      const data = await fetchCycleAttendanceReport(cycleId, reportFilters);
      setReportData(data);
      setError(null);
    } catch (err) {
      console.error('Error loading report data:', err);
      setError('Failed to load report data');
    }
  }, [setError]);

  useEffect(() => {
    if (selectedCycleId) {
      setLoading(true);
      loadReportData(selectedCycleId, filters).finally(() => setLoading(false));
    }
  }, [selectedCycleId, loadReportData]);

  // Auto-select squadron participants when report data loads
  useEffect(() => {
    if (
      reportData &&
      reportData.cycle.id === selectedCycleId &&
      reportData.cycle.participants &&
      filters.squadronIds.length === 0
    ) {
      const participantSquadronIds = Array.isArray(reportData.cycle.participants)
        ? reportData.cycle.participants.filter((id): id is string => typeof id === 'string')
        : [];

      if (participantSquadronIds.length > 0) {
        setFilters(prev => ({ ...prev, squadronIds: participantSquadronIds }));
      }
    }
  }, [reportData, selectedCycleId, filters.squadronIds.length]);

  // Handle filter changes
  const handleFilterChange = useCallback(async (newFilters: ReportFilters, requiresDataRefetch = true) => {
    if (!selectedCycleId) return;

    try {
      // Only show loading and refetch if squadron/qualification filters changed
      if (requiresDataRefetch) {
        setFilterLoading(true);
        setFilters(newFilters);
        await loadReportData(selectedCycleId, newFilters);
      } else {
        // Just update filters for display-only changes (metric toggles)
        setFilters(newFilters);
      }
    } finally {
      if (requiresDataRefetch) {
        setFilterLoading(false);
      }
    }
  }, [selectedCycleId, loadReportData]);

  // Handle cycle selection change
  const handleCycleChange = (cycleId: string) => {
    setSelectedCycleId(cycleId);
    // Reset squadron selection to allow auto-selection for new cycle
    setFilters(prev => ({ ...prev, squadronIds: [] }));
  };

  // Handle refresh button click
  const handleRefresh = async () => {
    if (!selectedCycleId) return;

    try {
      setRefreshing(true);
      await loadReportData(selectedCycleId, filters);
    } finally {
      setRefreshing(false);
    }
  };

  // Handle export to CSV
  const handleExportCSV = () => {
    if (!reportData) return;

    const csv = exportToCSV(reportData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportData.cycle.name}_attendance_report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Squadron filter handlers (client-side only, no refetch)
  const handleSquadronToggle = (squadronId: string) => {
    const newSquadronIds = filters.squadronIds.includes(squadronId)
      ? filters.squadronIds.filter(id => id !== squadronId)
      : [...filters.squadronIds, squadronId];

    handleFilterChange({ ...filters, squadronIds: newSquadronIds }, false);
  };

  const handleSelectAllSquadrons = () => {
    if (!reportData) return;
    handleFilterChange({ ...filters, squadronIds: reportData.squadrons.map(s => s.id) }, false);
  };

  const handleClearAllSquadrons = () => {
    handleFilterChange({ ...filters, squadronIds: [] }, false);
  };

  // Qualification filter handlers (requires refetch to recalculate metrics)
  const handleQualificationToggle = (qualId: string) => {
    const newQualIds = filters.qualificationIds.includes(qualId)
      ? filters.qualificationIds.filter(id => id !== qualId)
      : [...filters.qualificationIds, qualId];

    handleFilterChange({ ...filters, qualificationIds: newQualIds }, true);
  };

  const handleSelectAllQualifications = () => {
    if (!reportData) return;
    handleFilterChange({ ...filters, qualificationIds: reportData.qualifications.map(q => q.id) }, true);
  };

  const handleClearAllQualifications = () => {
    handleFilterChange({ ...filters, qualificationIds: [] }, true);
  };

  // Metric toggle handlers
  const handleToggleAttendancePercent = () => {
    handleFilterChange({ ...filters, showAttendancePercent: !filters.showAttendancePercent }, false);
  };

  const handleToggleAttendanceCount = () => {
    handleFilterChange({ ...filters, showAttendanceCount: !filters.showAttendanceCount }, false);
  };

  const handleToggleNoShowsPercent = () => {
    handleFilterChange({ ...filters, showNoShowsPercent: !filters.showNoShowsPercent }, false);
  };

  const handleToggleNoShowsCount = () => {
    handleFilterChange({ ...filters, showNoShowsCount: !filters.showNoShowsCount }, false);
  };

  const handleToggleSnivelsPercent = () => {
    handleFilterChange({ ...filters, showSnivelsPercent: !filters.showSnivelsPercent }, false);
  };

  const handleToggleSnivelsCount = () => {
    handleFilterChange({ ...filters, showSnivelsCount: !filters.showSnivelsCount }, false);
  };

  // Metric toggle handlers for Advanced Snivels
  const handleToggleAdvancedSnivelsPercent = () => {
    handleFilterChange({ ...filters, showAdvancedSnivelsPercent: !filters.showAdvancedSnivelsPercent }, false);
  };

  const handleToggleAdvancedSnivelsCount = () => {
    handleFilterChange({ ...filters, showAdvancedSnivelsCount: !filters.showAdvancedSnivelsCount }, false);
  };

  // Metric toggle handlers for Total Snivels
  const handleToggleTotalSnivelsPercent = () => {
    handleFilterChange({ ...filters, showTotalSnivelsPercent: !filters.showTotalSnivelsPercent }, false);
  };

  const handleToggleTotalSnivelsCount = () => {
    handleFilterChange({ ...filters, showTotalSnivelsCount: !filters.showTotalSnivelsCount }, false);
  };

  // Metric toggle handlers for No Response
  const handleToggleNoResponsePercent = () => {
    handleFilterChange({ ...filters, showNoResponsePercent: !filters.showNoResponsePercent }, false);
  };

  const handleToggleNoResponseCount = () => {
    handleFilterChange({ ...filters, showNoResponseCount: !filters.showNoResponseCount }, false);
  };

  // Clear all filters
  const handleClearFilters = () => {
    handleFilterChange({
      squadronIds: [],
      qualificationIds: [],
      showAttendancePercent: false,
      showAttendanceCount: true,
      showNoShowsPercent: false,
      showNoShowsCount: true,
      showSnivelsPercent: false,
      showSnivelsCount: true,
      showAdvancedSnivelsPercent: false,
      showAdvancedSnivelsCount: true,
      showTotalSnivelsPercent: false,
      showTotalSnivelsCount: false,
      showNoResponsePercent: false,
      showNoResponseCount: false,
      attendanceTrendLine: 'disabled',
      noShowsTrendLine: 'disabled',
      snivelsTrendLine: 'disabled',
      advancedSnivelsTrendLine: 'disabled',
      totalSnivelsTrendLine: 'disabled',
      noResponseTrendLine: 'disabled'
    });
  };

  // Trend line toggle handlers
  const handleToggleTrendLine = (metricType: 'attendance' | 'noShows' | 'snivels' | 'advancedSnivels' | 'totalSnivels' | 'noResponse') => {
    const key = `${metricType}TrendLine` as keyof ReportFilters;
    const currentValue = filters[key] as 'disabled' | 'linear' | 'moving-average';
    const nextType =
      currentValue === 'disabled' ? 'linear' :
      currentValue === 'linear' ? 'moving-average' :
      'disabled';
    handleFilterChange({ ...filters, [key]: nextType }, false);
  };

  // Helper function to calculate linear regression trend line
  const calculateLinearTrend = (data: number[]): number[] => {
    const n = data.length;
    if (n === 0) return [];

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return data.map((_, i) => slope * i + intercept);
  };

  // Helper function to calculate moving average
  const calculateMovingAverage = (data: number[], window: number = 3): number[] => {
    if (data.length === 0) return [];
    const result: number[] = [];

    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(data.length, i + Math.ceil(window / 2));
      const slice = data.slice(start, end);
      const avg = slice.reduce((sum, val) => sum + val, 0) / slice.length;
      result.push(avg);
    }

    return result;
  };

  // Cycle totals per squadron for the summary strip above the chart
  const squadronSummary = useMemo(() => {
    if (!reportData) return [];
    const selected = filters.squadronIds.length > 0
      ? reportData.squadrons.filter(sq => filters.squadronIds.includes(sq.id))
      : reportData.squadrons;
    return selected.map(sq => {
      const rows = reportData.eventSquadronMetrics
        .map(ev => ev.squadronMetrics.find(m => m.squadronId === sq.id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      const n = rows.length || 1;
      return {
        id: sq.id,
        designation: sq.designation,
        name: sq.name,
        insignia: sq.insignia_url || null,
        color: legibleHex(sq.color_palette?.primary),
        avgPct: Math.round(rows.reduce((a, m) => a + (m.attendancePercentage || 0), 0) / n),
        avgCount: rows.reduce((a, m) => a + (m.attendanceCount || 0), 0) / n,
        noShows: rows.reduce((a, m) => a + (m.noShowCount || 0), 0),
        snivels: rows.reduce((a, m) => a + (m.totalSnivelsCount || 0), 0),
      };
    });
  }, [reportData, filters.squadronIds]);

  // Memoize chart data generation to prevent expensive recalculations
  const chartData = useMemo(() => {
    if (!reportData) return null;

    const labels = reportData.eventSquadronMetrics.map(event => {
      const date = new Date(event.eventDate);
      return `${event.eventName}\n${date.toLocaleDateString()}`;
    });

    const datasets: any[] = [];
    // Filter squadrons client-side for instant filtering
    const selectedSquadrons = filters.squadronIds.length > 0
      ? reportData.squadrons.filter(sq => filters.squadronIds.includes(sq.id))
      : reportData.squadrons;

    selectedSquadrons.forEach(squadron => {
      // Canvas needs a real hex: lift near-black / near-white squadron colours for the theme
      const color = legibleHex(squadron.color_palette?.primary);

      // Attendance Percent
      if (filters.showAttendancePercent) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          return metrics?.attendancePercentage || 0;
        });

        datasets.push({
          label: `${squadron.designation} - Attendance`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [],
          tension: 0.3,
          yAxisID: 'y-percentage',
          pointStyle: 'line'
        });

        // Add trend line if enabled
        if (filters.attendanceTrendLine !== 'disabled') {
          const trendData = filters.attendanceTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - Attendance Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-percentage',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // Attendance Count
      if (filters.showAttendanceCount) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          return metrics?.attendanceCount || 0;
        });

        datasets.push({
          label: `${squadron.designation} - Attendance`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [],
          tension: 0.3,
          yAxisID: 'y-count',
          pointStyle: 'line'
        });

        // Add trend line if enabled
        if (filters.attendanceTrendLine !== 'disabled') {
          const trendData = filters.attendanceTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - Attendance Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-count',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // No Shows Percent
      if (filters.showNoShowsPercent) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          const percentage = metrics && metrics.totalPilots > 0
            ? Math.round((metrics.noShowCount / metrics.totalPilots) * 100)
            : 0;
          return percentage;
        });

        datasets.push({
          label: `${squadron.designation} - No Shows`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3,
          yAxisID: 'y-percentage',
          opacity: 0.8,
          pointStyle: 'dash'
        });

        // Add trend line if enabled
        if (filters.noShowsTrendLine !== 'disabled') {
          const trendData = filters.noShowsTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - No Shows Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-percentage',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // No Shows Count
      if (filters.showNoShowsCount) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          return metrics?.noShowCount || 0;
        });

        datasets.push({
          label: `${squadron.designation} - No Shows`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3,
          yAxisID: 'y-count',
          opacity: 0.8,
          pointStyle: 'dash'
        });

        // Add trend line if enabled
        if (filters.noShowsTrendLine !== 'disabled') {
          const trendData = filters.noShowsTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - No Shows Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-count',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // Last Minute Snivels Percent
      if (filters.showSnivelsPercent) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          const percentage = metrics && metrics.totalPilots > 0
            ? Math.round((metrics.lastMinuteSniveCount / metrics.totalPilots) * 100)
            : 0;
          return percentage;
        });

        datasets.push({
          label: `${squadron.designation} - Last Minute Snivels`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [2, 2],
          tension: 0.3,
          yAxisID: 'y-percentage',
          opacity: 0.6,
          pointStyle: 'rect'
        });

        // Add trend line if enabled
        if (filters.snivelsTrendLine !== 'disabled') {
          const trendData = filters.snivelsTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - Last Minute Snivels Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-percentage',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // Last Minute Snivels Count
      if (filters.showSnivelsCount) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          return metrics?.lastMinuteSniveCount || 0;
        });

        datasets.push({
          label: `${squadron.designation} - Last Minute Snivels`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [2, 2],
          tension: 0.3,
          yAxisID: 'y-count',
          opacity: 0.6,
          pointStyle: 'rect'
        });

        // Add trend line if enabled
        if (filters.snivelsTrendLine !== 'disabled') {
          const trendData = filters.snivelsTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - Last Minute Snivels Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-count',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // Advanced Snivels Percent
      if (filters.showAdvancedSnivelsPercent) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          const percentage = metrics && metrics.totalPilots > 0
            ? Math.round((metrics.advancedSniveCount / metrics.totalPilots) * 100)
            : 0;
          return percentage;
        });

        datasets.push({
          label: `${squadron.designation} - Advanced Snivels`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [8, 4],
          tension: 0.3,
          yAxisID: 'y-percentage',
          opacity: 0.6,
          pointStyle: 'triangle'
        });

        // Add trend line if enabled
        if (filters.advancedSnivelsTrendLine !== 'disabled') {
          const trendData = filters.advancedSnivelsTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - Advanced Snivels Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-percentage',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // Advanced Snivels Count
      if (filters.showAdvancedSnivelsCount) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          return metrics?.advancedSniveCount || 0;
        });

        datasets.push({
          label: `${squadron.designation} - Advanced Snivels`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [8, 4],
          tension: 0.3,
          yAxisID: 'y-count',
          opacity: 0.6,
          pointStyle: 'triangle'
        });

        // Add trend line if enabled
        if (filters.advancedSnivelsTrendLine !== 'disabled') {
          const trendData = filters.advancedSnivelsTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - Advanced Snivels Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-count',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // Total Snivels Percent
      if (filters.showTotalSnivelsPercent) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          const percentage = metrics && metrics.totalPilots > 0
            ? Math.round((metrics.totalSnivelsCount / metrics.totalPilots) * 100)
            : 0;
          return percentage;
        });

        datasets.push({
          label: `${squadron.designation} - Total Snivels`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.3,
          yAxisID: 'y-percentage',
          opacity: 0.7,
          pointStyle: 'circle'
        });

        // Add trend line if enabled
        if (filters.totalSnivelsTrendLine !== 'disabled') {
          const trendData = filters.totalSnivelsTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - Total Snivels Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-percentage',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // Total Snivels Count
      if (filters.showTotalSnivelsCount) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          return metrics?.totalSnivelsCount || 0;
        });

        datasets.push({
          label: `${squadron.designation} - Total Snivels`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.3,
          yAxisID: 'y-count',
          opacity: 0.7,
          pointStyle: 'circle'
        });

        // Add trend line if enabled
        if (filters.totalSnivelsTrendLine !== 'disabled') {
          const trendData = filters.totalSnivelsTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - Total Snivels Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-count',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // No Response Percent
      if (filters.showNoResponsePercent) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          const percentage = metrics && metrics.totalPilots > 0
            ? Math.round((metrics.noResponseCount / metrics.totalPilots) * 100)
            : 0;
          return percentage;
        });

        datasets.push({
          label: `${squadron.designation} - No Response`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [10, 2],
          tension: 0.3,
          yAxisID: 'y-percentage',
          opacity: 0.5,
          pointStyle: 'crossRot'
        });

        // Add trend line if enabled
        if (filters.noResponseTrendLine !== 'disabled') {
          const trendData = filters.noResponseTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - No Response Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-percentage',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }

      // No Response Count
      if (filters.showNoResponseCount) {
        const data = reportData.eventSquadronMetrics.map(event => {
          const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
          return metrics?.noResponseCount || 0;
        });

        datasets.push({
          label: `${squadron.designation} - No Response`,
          data,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [10, 2],
          tension: 0.3,
          yAxisID: 'y-count',
          opacity: 0.5,
          pointStyle: 'crossRot'
        });

        // Add trend line if enabled
        if (filters.noResponseTrendLine !== 'disabled') {
          const trendData = filters.noResponseTrendLine === 'linear'
            ? calculateLinearTrend(data)
            : calculateMovingAverage(data);

          datasets.push({
            label: `${squadron.designation} - No Response Trend`,
            data: trendData,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            tension: 0.3,
            yAxisID: 'y-count',
            pointStyle: false,
            pointRadius: 0
          });
        }
      }
    });

    return { labels, datasets };
  }, [reportData, filters]);

  // Custom plugin for HTML legend
  const htmlLegendPlugin = {
    id: 'htmlLegend',
    afterUpdate(chart: any) {
      const legendContainer = document.getElementById(`legend-${selectedCycleId}`);
      if (!legendContainer || !reportData) return;

      // Clear existing legend
      legendContainer.innerHTML = '';

      const datasets = chart.data.datasets;
      const squadronGroups = new Map<string, any[]>();

      // Group datasets by squadron
      datasets.forEach((dataset: any, i: number) => {
        const parts = (dataset.label || '').split(' - ');
        const squadronDesig = parts[0];
        const metricName = parts[1];

        if (!squadronGroups.has(squadronDesig)) {
          squadronGroups.set(squadronDesig, []);
        }

        squadronGroups.get(squadronDesig)!.push({
          text: metricName,
          color: dataset.borderColor,
          borderDash: dataset.borderDash || [],
          hidden: !chart.isDatasetVisible(i),
          index: i
        });
      });

      // Build HTML legend
      const legendDiv = document.createElement('div');
      legendDiv.style.display = 'flex';
      legendDiv.style.flexWrap = 'wrap';
      legendDiv.style.gap = '20px';
      legendDiv.style.padding = '10px';
      legendDiv.style.fontFamily = 'var(--rr-font-ui)';
      legendDiv.style.fontSize = '11px';

      squadronGroups.forEach((metrics, squadronDesig) => {
        const squadronDiv = document.createElement('div');
        squadronDiv.style.display = 'flex';
        squadronDiv.style.flexDirection = 'column';
        squadronDiv.style.gap = '4px';

        // Find squadron data for insignia
        const squadron = reportData.squadrons.find(sq => sq.designation === squadronDesig);

        // Squadron header with insignia
        const headerDiv = document.createElement('div');
        headerDiv.style.fontWeight = 'bold';
        headerDiv.style.marginBottom = '4px';
        headerDiv.style.display = 'flex';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.gap = '6px';

        // Add squadron insignia if available
        if (squadron?.insignia_url) {
          const insigniaImg = document.createElement('div');
          insigniaImg.style.width = '20px';
          insigniaImg.style.height = '20px';
          insigniaImg.style.backgroundImage = `url(${squadron.insignia_url})`;
          insigniaImg.style.backgroundSize = 'contain';
          insigniaImg.style.backgroundRepeat = 'no-repeat';
          insigniaImg.style.backgroundPosition = 'center';
          insigniaImg.style.flexShrink = '0';
          headerDiv.appendChild(insigniaImg);
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = squadronDesig;
        headerDiv.appendChild(textSpan);

        squadronDiv.appendChild(headerDiv);

        // Metrics under squadron
        metrics.forEach(metric => {
          const metricDiv = document.createElement('div');
          metricDiv.style.display = 'flex';
          metricDiv.style.alignItems = 'center';
          metricDiv.style.gap = '6px';
          metricDiv.style.cursor = 'pointer';
          metricDiv.style.opacity = metric.hidden ? '0.3' : '1';
          metricDiv.style.paddingLeft = '8px';

          // Create SVG line indicator
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', '30');
          svg.setAttribute('height', '12');
          svg.style.display = 'block';

          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', '0');
          line.setAttribute('y1', '6');
          line.setAttribute('x2', '30');
          line.setAttribute('y2', '6');
          line.setAttribute('stroke', metric.color);
          line.setAttribute('stroke-width', '2');

          // Apply dash pattern if present
          if (metric.borderDash.length > 0) {
            line.setAttribute('stroke-dasharray', metric.borderDash.join(','));
          }

          svg.appendChild(line);
          metricDiv.appendChild(svg);

          // Metric text
          const textSpan = document.createElement('span');
          textSpan.textContent = metric.text;
          metricDiv.appendChild(textSpan);

          // Click handler to toggle visibility
          metricDiv.onclick = () => {
            const meta = chart.getDatasetMeta(metric.index);
            meta.hidden = !meta.hidden;
            chart.update();
          };

          squadronDiv.appendChild(metricDiv);
        });

        legendDiv.appendChild(squadronDiv);
      });

      legendContainer.appendChild(legendDiv);
    }
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false // Disable default legend, use custom HTML legend
      },
      title: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: {
          family: 'Saira',
          size: 13
        },
        bodyFont: {
          family: 'Saira',
          size: 12
        },
        callbacks: {
          title: (context) => {
            // Show full event name in tooltip
            if (reportData && context[0]) {
              const eventIndex = context[0].dataIndex;
              const event = reportData.eventSquadronMetrics[eventIndex];
              return event?.eventName || context[0].label;
            }
            return context[0]?.label || '';
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Event',
          font: {
            family: 'Saira',
            size: 12
          }
        },
        ticks: {
          font: {
            family: 'Saira',
            size: 10
          },
          callback: function(value, index) {
            // Format labels as "Week N\nDate"
            if (reportData && reportData.eventSquadronMetrics[index]) {
              const event = reportData.eventSquadronMetrics[index];
              const eventName = event.eventName || '';

              // Try to extract "Week N" from event name
              const weekMatch = eventName.match(/Week\s+(\d+)/i);
              const weekLabel = weekMatch ? `Week ${weekMatch[1]}` : `Event ${index + 1}`;

              // Format date
              const eventDate = new Date(event.eventDate);
              const dateStr = eventDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });

              return [weekLabel, dateStr];
            }
            return value;
          }
        }
      },
      'y-percentage': {
        type: 'linear' as const,
        display: filters.showAttendancePercent || filters.showNoShowsPercent || filters.showSnivelsPercent || filters.showAdvancedSnivelsPercent || filters.showTotalSnivelsPercent || filters.showNoResponsePercent,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Percentage (%)',
          font: {
            family: 'Saira',
            size: 12
          }
        },
        min: 0,
        max: 100,
        ticks: {
          font: {
            family: 'Saira',
            size: 11
          }
        }
      },
      'y-count': {
        type: 'linear' as const,
        display: filters.showAttendanceCount || filters.showNoShowsCount || filters.showSnivelsCount || filters.showAdvancedSnivelsCount || filters.showTotalSnivelsCount || filters.showNoResponseCount,
        position: 'right' as const,
        beginAtZero: true,
        title: {
          display: true,
          text: 'Count',
          font: {
            family: 'Saira',
            size: 12
          }
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          font: {
            family: 'Saira',
            size: 11
          },
          stepSize: 1,
          callback: function(value) {
            if (Number.isInteger(value)) {
              return value;
            }
            return null; // Don't show non-integer values
          }
        }
      }
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '16px' }}>
            <LoadingSpinner size="large" color="#82728C" />
          </div>
          <p style={{ fontFamily: 'inherit', color: 'var(--rr-text2)', fontSize: '14px' }}>Loading report data...</p>
        </div>
      </div>
    );
  }

  const activeFilterCount = filters.squadronIds.length + filters.qualificationIds.length;

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Header with controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="w-[400px] max-w-full">
            <Select
              value={selectedCycleId || ''}
              onChange={(v) => handleCycleChange(v)}
              disabled={filterLoading}
              options={cycles.map(cycle => ({ value: cycle.id, label: cycle.name }))}
            />
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing || filterLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--rr-border)',
              backgroundColor: 'var(--rr-panel)',
              color: 'var(--rr-text2)',
              fontSize: '14px',
              fontFamily: 'inherit',
              cursor: (refreshing || filterLoading) ? 'not-allowed' : 'pointer',
              opacity: (refreshing || filterLoading) ? 0.6 : 1
            }}
          >
            <Icon name="refresh" size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {filterLoading && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#82728C]"></div>
          )}

          <button
            onClick={() => setShowFilters(!showFilters)}
            disabled={filterLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--rr-border)',
              backgroundColor: showFilters ? '#82728C' : 'var(--rr-panel)',
              color: showFilters ? 'white' : 'var(--rr-text2)',
              fontSize: '14px',
              fontFamily: 'inherit',
              cursor: filterLoading ? 'not-allowed' : 'pointer',
              opacity: filterLoading ? 0.6 : 1
            }}
          >
            <Icon name="filter" size={16} />
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                backgroundColor: showFilters ? 'var(--rr-panel)' : '#82728C',
                color: showFilters ? '#82728C' : 'white',
                borderRadius: '10px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!reportData || filterLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--rr-border)',
              backgroundColor: 'var(--rr-panel)',
              color: 'var(--rr-text2)',
              fontSize: '14px',
              fontFamily: 'inherit',
              cursor: (reportData && !filterLoading) ? 'pointer' : 'not-allowed',
              opacity: (reportData && !filterLoading) ? 1 : 0.5
            }}
          >
            <Icon name="download" size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          backgroundColor: 'rgba(224,82,78,.12)',
          border: '1px solid var(--rr-bad)',
          color: 'var(--rr-bad)',
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
          fontFamily: 'inherit',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {/* Filter drawer */}
      {showFilters && reportData && (
        <div style={{
          backgroundColor: 'var(--rr-panel2)',
          border: '1px solid var(--rr-border)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          opacity: filterLoading ? 0.6 : 1,
          pointerEvents: filterLoading ? 'none' : 'auto'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <h3 style={{
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--rr-text)',
              margin: 0
            }}>
              Filter Options
            </h3>
            <button
              onClick={handleClearFilters}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                color: 'var(--rr-text2)',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              <Icon name="close" size={14} />
              Clear All
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            {/* Squadron filters */}
            <FilterSection
              title="Squadron"
              onSelectAll={handleSelectAllSquadrons}
              onClearAll={handleClearAllSquadrons}
            >
              {reportData.squadrons.map(squadron => (
                <FilterItem
                  key={squadron.id}
                  isSelected={filters.squadronIds.includes(squadron.id)}
                  onClick={() => handleSquadronToggle(squadron.id)}
                >
                  <Checkbox isSelected={filters.squadronIds.includes(squadron.id)} />
                  {squadron.insignia_url ? (
                    <div style={{
                      width: '20px',
                      height: '20px',
                      backgroundImage: `url(${squadron.insignia_url})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      flexShrink: 0
                    }} />
                  ) : (
                    <div style={{
                      width: '20px',
                      height: '20px',
                      backgroundColor: 'var(--rr-panel3)',
                      borderRadius: '3px',
                      flexShrink: 0
                    }} />
                  )}
                  <span style={{ flex: 1, fontSize: '12px' }}>{squadron.designation}</span>
                </FilterItem>
              ))}
            </FilterSection>

            {/* Qualification filters */}
            <FilterSection
              title="Qualification"
              onSelectAll={handleSelectAllQualifications}
              onClearAll={handleClearAllQualifications}
            >
              {reportData.qualifications.map(qual => (
                <FilterItem
                  key={qual.id}
                  isSelected={filters.qualificationIds.includes(qual.id)}
                  onClick={() => handleQualificationToggle(qual.id)}
                >
                  <Checkbox isSelected={filters.qualificationIds.includes(qual.id)} />
                  <div style={{
                    minWidth: '20px',
                    height: '14px',
                    backgroundColor: qual.color || '#6B7280',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    padding: '0 2px'
                  }}>
                    <span style={{ fontSize: '8px', color: '#FFFFFF', fontFamily: 'inherit', fontWeight: 500 }}>
                      {qual.code}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', flex: 1 }}>{qual.name}</span>
                </FilterItem>
              ))}
            </FilterSection>

            {/* Metric toggles */}
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <h4 style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  color: 'var(--rr-text)',
                  margin: 0
                }}>
                  Metrics
                </h4>
              </div>
              <div style={{
                border: '1px solid var(--rr-border)',
                borderRadius: '4px',
                padding: '8px'
              }}>
                <MetricRow label="Attendance">
                  <MetricToggleButton
                    active={filters.showAttendancePercent}
                    onClick={handleToggleAttendancePercent}
                  >
                    %
                  </MetricToggleButton>
                  <MetricToggleButton
                    active={filters.showAttendanceCount}
                    onClick={handleToggleAttendanceCount}
                  >
                    Count
                  </MetricToggleButton>
                  <TrendLineToggleButton
                    active={filters.attendanceTrendLine}
                    onClick={() => handleToggleTrendLine('attendance')}
                  />
                </MetricRow>

                <MetricRow label="No Shows">
                  <MetricToggleButton
                    active={filters.showNoShowsPercent}
                    onClick={handleToggleNoShowsPercent}
                  >
                    %
                  </MetricToggleButton>
                  <MetricToggleButton
                    active={filters.showNoShowsCount}
                    onClick={handleToggleNoShowsCount}
                  >
                    Count
                  </MetricToggleButton>
                  <TrendLineToggleButton
                    active={filters.noShowsTrendLine}
                    onClick={() => handleToggleTrendLine('noShows')}
                  />
                </MetricRow>

                <MetricRow label="Last Minute Snivels">
                  <MetricToggleButton
                    active={filters.showSnivelsPercent}
                    onClick={handleToggleSnivelsPercent}
                  >
                    %
                  </MetricToggleButton>
                  <MetricToggleButton
                    active={filters.showSnivelsCount}
                    onClick={handleToggleSnivelsCount}
                  >
                    Count
                  </MetricToggleButton>
                  <TrendLineToggleButton
                    active={filters.snivelsTrendLine}
                    onClick={() => handleToggleTrendLine('snivels')}
                  />
                </MetricRow>

                <MetricRow label="Advanced Snivels">
                  <MetricToggleButton
                    active={filters.showAdvancedSnivelsPercent}
                    onClick={handleToggleAdvancedSnivelsPercent}
                  >
                    %
                  </MetricToggleButton>
                  <MetricToggleButton
                    active={filters.showAdvancedSnivelsCount}
                    onClick={handleToggleAdvancedSnivelsCount}
                  >
                    Count
                  </MetricToggleButton>
                  <TrendLineToggleButton
                    active={filters.advancedSnivelsTrendLine}
                    onClick={() => handleToggleTrendLine('advancedSnivels')}
                  />
                </MetricRow>

                <MetricRow label="Total Snivels">
                  <MetricToggleButton
                    active={filters.showTotalSnivelsPercent}
                    onClick={handleToggleTotalSnivelsPercent}
                  >
                    %
                  </MetricToggleButton>
                  <MetricToggleButton
                    active={filters.showTotalSnivelsCount}
                    onClick={handleToggleTotalSnivelsCount}
                  >
                    Count
                  </MetricToggleButton>
                  <TrendLineToggleButton
                    active={filters.totalSnivelsTrendLine}
                    onClick={() => handleToggleTrendLine('totalSnivels')}
                  />
                </MetricRow>

                <MetricRow label="No Response">
                  <MetricToggleButton
                    active={filters.showNoResponsePercent}
                    onClick={handleToggleNoResponsePercent}
                  >
                    %
                  </MetricToggleButton>
                  <MetricToggleButton
                    active={filters.showNoResponseCount}
                    onClick={handleToggleNoResponseCount}
                  >
                    Count
                  </MetricToggleButton>
                  <TrendLineToggleButton
                    active={filters.noResponseTrendLine}
                    onClick={() => handleToggleTrendLine('noResponse')}
                  />
                </MetricRow>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-squadron summary for the cycle (same squadron filter as the chart) */}
      {squadronSummary.length > 0 ? (
        <div className="grid gap-[10px] mb-[14px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {squadronSummary.map(sq => (
            <div key={sq.id} className="rounded-rr-lg border border-border bg-panel2 p-[12px] flex flex-col gap-[10px]" style={{ boxShadow: `inset 3px 0 0 ${sq.color}` }}>
              <div className="flex items-center gap-[8px] min-w-0">
                {sq.insignia ? <img src={sq.insignia} alt="" className="w-[22px] h-[22px] object-contain" /> : null}
                <span className="text-[13.5px] font-bold" style={{ color: sq.color }}>{sq.designation}</span>
                <span className="text-[11.5px] text-text3 truncate">{sq.name}</span>
              </div>
              <div className="grid grid-cols-4 gap-[6px]">
                {[
                  { k: 'Avg att.', v: `${sq.avgPct}%` },
                  { k: 'Per event', v: sq.avgCount.toFixed(1) },
                  { k: 'No shows', v: String(sq.noShows) },
                  { k: 'Snivels', v: String(sq.snivels) },
                ].map(m => (
                  <div key={m.k} className="min-w-0">
                    <div className="font-mono text-[15px] font-semibold text-text leading-[1.2]">{m.v}</div>
                    <div className="text-[10.5px] text-text3 uppercase tracking-[.05em] truncate">{m.k}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Chart */}
      {chartData && chartData.datasets.length > 0 ? (
        <div style={{
          backgroundColor: 'var(--rr-panel)',
          border: '1px solid var(--rr-border)',
          borderRadius: '8px',
          padding: '24px',
          position: 'relative'
        }}>
          {filterLoading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'color-mix(in srgb, var(--rr-panel) 78%, transparent)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: '8px',
              zIndex: 10
            }}>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
            </div>
          )}

          {/* Custom legend container */}
          <div
            id={`legend-${selectedCycleId}`}
            style={{
              marginBottom: '16px',
              border: '1px solid var(--rr-border)',
              borderRadius: '6px',
              backgroundColor: 'var(--rr-panel2)'
            }}
          />

          {/* Chart */}
          <div style={{ height: '450px' }}>
            <Line
              data={chartData}
              options={chartOptions}
              plugins={[htmlLegendPlugin]}
              redraw={false}
            />
          </div>

          {/* Explanatory note */}
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'var(--rr-panel2)',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'inherit',
            color: 'var(--rr-text2)',
            lineHeight: '1.8'
          }}>
            <strong style={{ color: 'var(--rr-text2)' }}>Note:</strong>
            <br />
            <strong>No Shows:</strong> Pilots who responded "attending" to the Discord event but were not marked present during roll call.
            <br />
            <strong>Last Minute Snivels:</strong> Pilots who changed their response from "attending" to "declined" or "tentative" within 2 hours of the event start time.
            <br />
            <strong>Advanced Snivels:</strong> Pilots who were not in attendance but marked themselves as "declined" or "tentative" more than 2 hours before the event start time.
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '60px 40px',
          color: 'var(--rr-text2)',
          fontFamily: 'inherit',
          backgroundColor: 'var(--rr-panel)',
          border: '1px solid var(--rr-border)',
          borderRadius: '8px'
        }}>
          {reportData && reportData.events.length === 0 ? (
            <>
              <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>No events found</p>
              <p style={{ fontSize: '14px' }}>This cycle has no past events to display.</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>No data to display</p>
              <p style={{ fontSize: '14px' }}>Select squadrons and metrics from the filters above.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Helper components
const Checkbox: React.FC<{ isSelected: boolean }> = ({ isSelected }) => (
  <div style={{
    width: '14px',
    height: '14px',
    border: '1px solid var(--rr-border2)',
    borderRadius: '3px',
    backgroundColor: isSelected ? 'var(--rr-accent)' : 'var(--rr-panel)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  }}>
    {isSelected && (
      <span style={{ color: '#FFFFFF', fontSize: '10px' }}>✓</span>
    )}
  </div>
);

const FilterSection: React.FC<{
  title: string;
  onSelectAll: () => void;
  onClearAll: () => void;
  children: React.ReactNode;
}> = ({ title, onSelectAll, onClearAll, children }) => (
  <div>
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    }}>
      <h4 style={{
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'inherit',
        color: 'var(--rr-text)',
        margin: 0
      }}>
        {title}
      </h4>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={onSelectAll} style={{
          padding: '2px 6px',
          backgroundColor: 'var(--rr-accent-weak)',
          border: '1px solid var(--rr-accent)',
          borderRadius: '3px',
          fontSize: '10px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'var(--rr-accent-text)'
        }}>
          All
        </button>
        <button onClick={onClearAll} style={{
          padding: '2px 6px',
          backgroundColor: 'rgba(224,82,78,.12)',
          border: '1px solid var(--rr-bad)',
          borderRadius: '3px',
          fontSize: '10px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'var(--rr-bad)'
        }}>
          None
        </button>
      </div>
    </div>
    <div style={{
      maxHeight: '200px',
      overflowY: 'auto',
      border: '1px solid var(--rr-border)',
      borderRadius: '4px',
      padding: '4px'
    }}>
      {children}
    </div>
  </div>
);

const FilterItem: React.FC<{
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ isSelected, onClick, children }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '6px 8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: isSelected ? 'var(--rr-accent-weak)' : (isHovered ? 'var(--rr-panel2)' : 'transparent'),
        borderRadius: '3px',
        transition: 'background-color 0.2s',
        marginBottom: '2px'
      }}
    >
      {children}
    </div>
  );
};

const MetricRow: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
    gap: '8px'
  }}>
    <span style={{
      fontSize: '12px',
      fontFamily: 'inherit',
      color: 'var(--rr-text)',
      flex: 1
    }}>
      {label}
    </span>
    <div style={{ display: 'flex', gap: '4px' }}>
      {children}
    </div>
  </div>
);

const MetricToggleButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '4px 12px',
      borderRadius: '4px',
      cursor: 'pointer',
      backgroundColor: active ? 'var(--rr-accent-weak)' : 'var(--rr-panel2)',
      border: `1px solid ${active ? 'var(--rr-accent)' : 'var(--rr-border2)'}`,
      color: active ? 'var(--rr-accent-text)' : 'var(--rr-text2)',
      fontSize: '11px',
      fontFamily: 'inherit',
      fontWeight: 500,
      transition: 'all 0.2s',
      minWidth: '50px'
    }}
  >
    {children}
  </button>
);

const TrendLineToggleButton: React.FC<{
  active: 'disabled' | 'linear' | 'moving-average';
  onClick: () => void;
}> = ({ active, onClick }) => {
  const displayText =
    active === 'disabled' ? 'Disabled' :
    active === 'linear' ? 'Linear' :
    'Moving Avg';

  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        backgroundColor: active !== 'disabled' ? 'var(--rr-accent-weak)' : 'var(--rr-panel2)',
        border: `1px solid ${active !== 'disabled' ? 'var(--rr-accent)' : 'var(--rr-border2)'}`,
        color: active !== 'disabled' ? 'var(--rr-accent-text)' : 'var(--rr-text2)',
        fontSize: '11px',
        fontFamily: 'inherit',
        fontWeight: 500,
        transition: 'all 0.2s',
        minWidth: '90px'
      }}
    >
      {displayText}
    </button>
  );
};

export default CycleAttendanceReport;
