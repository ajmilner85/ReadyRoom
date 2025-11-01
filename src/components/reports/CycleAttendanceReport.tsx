import React, { useState, useEffect, useCallback } from 'react';
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
import { RefreshCw, Download, Filter, X } from 'lucide-react';
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
    showSnivelsCount: true
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
    if (reportData && reportData.cycle.participants && filters.squadronIds.length === 0) {
      const participantSquadronIds = Array.isArray(reportData.cycle.participants)
        ? reportData.cycle.participants.map((p: any) => p.squadronId).filter(Boolean)
        : [];

      if (participantSquadronIds.length > 0) {
        setFilters(prev => ({ ...prev, squadronIds: participantSquadronIds }));
      }
    }
  }, [reportData, filters.squadronIds.length]);

  // Handle filter changes
  const handleFilterChange = useCallback(async (newFilters: ReportFilters) => {
    if (!selectedCycleId) return;

    try {
      setFilterLoading(true);
      setFilters(newFilters);
      await loadReportData(selectedCycleId, newFilters);
    } finally {
      setFilterLoading(false);
    }
  }, [selectedCycleId, loadReportData]);

  // Handle cycle selection change
  const handleCycleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCycleId(e.target.value);
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

  // Squadron filter handlers
  const handleSquadronToggle = (squadronId: string) => {
    const newSquadronIds = filters.squadronIds.includes(squadronId)
      ? filters.squadronIds.filter(id => id !== squadronId)
      : [...filters.squadronIds, squadronId];

    handleFilterChange({ ...filters, squadronIds: newSquadronIds });
  };

  const handleSelectAllSquadrons = () => {
    if (!reportData) return;
    handleFilterChange({ ...filters, squadronIds: reportData.squadrons.map(s => s.id) });
  };

  const handleClearAllSquadrons = () => {
    handleFilterChange({ ...filters, squadronIds: [] });
  };

  // Qualification filter handlers
  const handleQualificationToggle = (qualId: string) => {
    const newQualIds = filters.qualificationIds.includes(qualId)
      ? filters.qualificationIds.filter(id => id !== qualId)
      : [...filters.qualificationIds, qualId];

    handleFilterChange({ ...filters, qualificationIds: newQualIds });
  };

  const handleSelectAllQualifications = () => {
    if (!reportData) return;
    handleFilterChange({ ...filters, qualificationIds: reportData.qualifications.map(q => q.id) });
  };

  const handleClearAllQualifications = () => {
    handleFilterChange({ ...filters, qualificationIds: [] });
  };

  // Metric toggle handlers
  const handleToggleAttendancePercent = () => {
    handleFilterChange({ ...filters, showAttendancePercent: !filters.showAttendancePercent });
  };

  const handleToggleAttendanceCount = () => {
    handleFilterChange({ ...filters, showAttendanceCount: !filters.showAttendanceCount });
  };

  const handleToggleNoShowsPercent = () => {
    handleFilterChange({ ...filters, showNoShowsPercent: !filters.showNoShowsPercent });
  };

  const handleToggleNoShowsCount = () => {
    handleFilterChange({ ...filters, showNoShowsCount: !filters.showNoShowsCount });
  };

  const handleToggleSnivelsPercent = () => {
    handleFilterChange({ ...filters, showSnivelsPercent: !filters.showSnivelsPercent });
  };

  const handleToggleSnivelsCount = () => {
    handleFilterChange({ ...filters, showSnivelsCount: !filters.showSnivelsCount });
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
      showSnivelsCount: true
    });
  };

  // Generate chart data based on selected filters
  const generateChartData = () => {
    if (!reportData) return null;

    const labels = reportData.eventSquadronMetrics.map(event => {
      const date = new Date(event.eventDate);
      return `${event.eventName}\n${date.toLocaleDateString()}`;
    });

    const datasets: any[] = [];
    const selectedSquadrons = filters.squadronIds.length > 0
      ? reportData.squadrons.filter(sq => filters.squadronIds.includes(sq.id))
      : reportData.squadrons;

    selectedSquadrons.forEach(squadron => {
      const color = squadron.color_palette?.primary || '#6B7280';

      // Attendance Percent
      if (filters.showAttendancePercent) {
        datasets.push({
          label: `${squadron.designation} - Attendance`,
          data: reportData.eventSquadronMetrics.map(event => {
            const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
            return metrics?.attendancePercentage || 0;
          }),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [],
          tension: 0.3,
          yAxisID: 'y-percentage',
          pointStyle: 'line'
        });
      }

      // Attendance Count
      if (filters.showAttendanceCount) {
        datasets.push({
          label: `${squadron.designation} - Attendance`,
          data: reportData.eventSquadronMetrics.map(event => {
            const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
            return metrics?.attendanceCount || 0;
          }),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [],
          tension: 0.3,
          yAxisID: 'y-count',
          pointStyle: 'line'
        });
      }

      // No Shows Percent
      if (filters.showNoShowsPercent) {
        datasets.push({
          label: `${squadron.designation} - No Shows`,
          data: reportData.eventSquadronMetrics.map(event => {
            const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
            const percentage = metrics && metrics.totalPilots > 0
              ? Math.round((metrics.noShowCount / metrics.totalPilots) * 100)
              : 0;
            return percentage;
          }),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3,
          yAxisID: 'y-percentage',
          opacity: 0.8,
          pointStyle: 'dash'
        });
      }

      // No Shows Count
      if (filters.showNoShowsCount) {
        datasets.push({
          label: `${squadron.designation} - No Shows`,
          data: reportData.eventSquadronMetrics.map(event => {
            const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
            return metrics?.noShowCount || 0;
          }),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3,
          yAxisID: 'y-count',
          opacity: 0.8,
          pointStyle: 'dash'
        });
      }

      // Snivels Percent
      if (filters.showSnivelsPercent) {
        datasets.push({
          label: `${squadron.designation} - Snivels`,
          data: reportData.eventSquadronMetrics.map(event => {
            const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
            const percentage = metrics && metrics.totalPilots > 0
              ? Math.round((metrics.lastMinuteSniveCount / metrics.totalPilots) * 100)
              : 0;
            return percentage;
          }),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [2, 2],
          tension: 0.3,
          yAxisID: 'y-percentage',
          opacity: 0.6,
          pointStyle: 'rect'
        });
      }

      // Snivels Count
      if (filters.showSnivelsCount) {
        datasets.push({
          label: `${squadron.designation} - Snivels`,
          data: reportData.eventSquadronMetrics.map(event => {
            const metrics = event.squadronMetrics.find(m => m.squadronId === squadron.id);
            return metrics?.lastMinuteSniveCount || 0;
          }),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          borderDash: [2, 2],
          tension: 0.3,
          yAxisID: 'y-count',
          opacity: 0.6,
          pointStyle: 'rect'
        });
      }
    });

    return { labels, datasets };
  };

  const chartData = generateChartData();

  // Custom plugin for HTML legend
  const htmlLegendPlugin = {
    id: 'htmlLegend',
    afterUpdate(chart: any) {
      const legendContainer = document.getElementById(`legend-${selectedCycleId}`);
      if (!legendContainer) return;

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
      legendDiv.style.fontFamily = 'Inter';
      legendDiv.style.fontSize = '11px';

      squadronGroups.forEach((metrics, squadronDesig) => {
        const squadronDiv = document.createElement('div');
        squadronDiv.style.display = 'flex';
        squadronDiv.style.flexDirection = 'column';
        squadronDiv.style.gap = '4px';

        // Squadron header
        const headerDiv = document.createElement('div');
        headerDiv.style.fontWeight = 'bold';
        headerDiv.style.marginBottom = '4px';
        headerDiv.textContent = squadronDesig;
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
          family: 'Inter',
          size: 13
        },
        bodyFont: {
          family: 'Inter',
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
            family: 'Inter',
            size: 12
          }
        },
        ticks: {
          font: {
            family: 'Inter',
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
        display: filters.showAttendancePercent || filters.showNoShowsPercent || filters.showSnivelsPercent,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Percentage (%)',
          font: {
            family: 'Inter',
            size: 12
          }
        },
        min: 0,
        max: 100,
        ticks: {
          font: {
            family: 'Inter',
            size: 11
          }
        }
      },
      'y-count': {
        type: 'linear' as const,
        display: filters.showAttendanceCount || filters.showNoShowsCount || filters.showSnivelsCount,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Count',
          font: {
            family: 'Inter',
            size: 12
          }
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          font: {
            family: 'Inter',
            size: 11
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#82728C] mx-auto mb-4"></div>
          <p style={{ fontFamily: 'Inter', color: '#64748B', fontSize: '14px' }}>Loading report data...</p>
        </div>
      </div>
    );
  }

  const activeFilterCount = filters.squadronIds.length + filters.qualificationIds.length;

  return (
    <div style={{ fontFamily: 'Inter' }}>
      {/* Header with controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select
            value={selectedCycleId || ''}
            onChange={handleCycleChange}
            disabled={filterLoading}
            style={{
              fontFamily: 'Inter',
              fontSize: '14px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              backgroundColor: 'white',
              color: '#1E293B',
              cursor: filterLoading ? 'not-allowed' : 'pointer',
              opacity: filterLoading ? 0.6 : 1
            }}
          >
            {cycles.map(cycle => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleRefresh}
            disabled={refreshing || filterLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              backgroundColor: 'white',
              color: '#64748B',
              fontSize: '14px',
              fontFamily: 'Inter',
              cursor: (refreshing || filterLoading) ? 'not-allowed' : 'pointer',
              opacity: (refreshing || filterLoading) ? 0.6 : 1
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
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
              border: '1px solid #E2E8F0',
              backgroundColor: showFilters ? '#82728C' : 'white',
              color: showFilters ? 'white' : '#64748B',
              fontSize: '14px',
              fontFamily: 'Inter',
              cursor: filterLoading ? 'not-allowed' : 'pointer',
              opacity: filterLoading ? 0.6 : 1
            }}
          >
            <Filter size={16} />
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                backgroundColor: showFilters ? 'white' : '#82728C',
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
              border: '1px solid #E2E8F0',
              backgroundColor: 'white',
              color: '#64748B',
              fontSize: '14px',
              fontFamily: 'Inter',
              cursor: (reportData && !filterLoading) ? 'pointer' : 'not-allowed',
              opacity: (reportData && !filterLoading) ? 1 : 0.5
            }}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          backgroundColor: '#FEE2E2',
          border: '1px solid #FCA5A5',
          color: '#991B1B',
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
          fontFamily: 'Inter',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {/* Filter drawer */}
      {showFilters && reportData && (
        <div style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
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
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1E293B',
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
                color: '#64748B',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Inter'
              }}
            >
              <X size={14} />
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
                      backgroundColor: '#E5E7EB',
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
                    <span style={{ fontSize: '8px', color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 500 }}>
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
                  fontFamily: 'Inter',
                  color: '#374151',
                  margin: 0
                }}>
                  Metrics
                </h4>
              </div>
              <div style={{
                border: '1px solid #E5E7EB',
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
                </MetricRow>

                <MetricRow label="Snivels">
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
                </MetricRow>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData && chartData.datasets.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #E2E8F0',
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
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: '8px',
              zIndex: 10
            }}>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#82728C]"></div>
            </div>
          )}

          {/* Custom legend container */}
          <div
            id={`legend-${selectedCycleId}`}
            style={{
              marginBottom: '16px',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              backgroundColor: '#F8FAFC'
            }}
          />

          {/* Chart */}
          <div style={{ height: '450px' }}>
            <Line data={chartData} options={chartOptions} plugins={[htmlLegendPlugin]} />
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '60px 40px',
          color: '#64748B',
          fontFamily: 'Inter',
          backgroundColor: 'white',
          border: '1px solid #E2E8F0',
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
    border: '1px solid #CBD5E1',
    borderRadius: '3px',
    backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
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
        fontFamily: 'Inter',
        color: '#374151',
        margin: 0
      }}>
        {title}
      </h4>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={onSelectAll} style={{
          padding: '2px 6px',
          backgroundColor: '#EFF6FF',
          border: '1px solid #DBEAFE',
          borderRadius: '3px',
          fontSize: '10px',
          cursor: 'pointer',
          fontFamily: 'Inter',
          color: '#1E40AF'
        }}>
          All
        </button>
        <button onClick={onClearAll} style={{
          padding: '2px 6px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '3px',
          fontSize: '10px',
          cursor: 'pointer',
          fontFamily: 'Inter',
          color: '#DC2626'
        }}>
          None
        </button>
      </div>
    </div>
    <div style={{
      maxHeight: '200px',
      overflowY: 'auto',
      border: '1px solid #E5E7EB',
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
        backgroundColor: isSelected ? '#EFF6FF' : (isHovered ? '#F8FAFC' : 'transparent'),
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
      fontFamily: 'Inter',
      color: '#374151',
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
      backgroundColor: active ? '#EFF6FF' : '#F3F4F6',
      border: `1px solid ${active ? '#DBEAFE' : '#D1D5DB'}`,
      color: active ? '#1E40AF' : '#6B7280',
      fontSize: '11px',
      fontFamily: 'Inter',
      fontWeight: 500,
      transition: 'all 0.2s',
      minWidth: '50px'
    }}
  >
    {children}
  </button>
);

export default CycleAttendanceReport;
