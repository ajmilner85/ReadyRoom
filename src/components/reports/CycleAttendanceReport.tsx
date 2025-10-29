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
  ReportFilters,
  PilotData
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
  const [filters, setFilters] = useState<ReportFilters>({
    squadronIds: [],
    pilotIds: []
  });

  // Load cycles and set default cycle
  useEffect(() => {
    const loadCycles = async () => {
      try {
        setLoading(true);
        const cyclesData = await fetchCycles();
        setCycles(cyclesData);

        // Auto-select default cycle
        const defaultCycle = await fetchDefaultCycle();
        if (defaultCycle) {
          setSelectedCycleId(defaultCycle.id);
        } else if (cyclesData.length > 0) {
          setSelectedCycleId(cyclesData[0].id);
        }
      } catch (err) {
        console.error('Error loading cycles:', err);
        setError('Failed to load cycles');
      } finally {
        setLoading(false);
      }
    };

    loadCycles();
  }, [setError]);

  // Load report data when cycle or filters change
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
      loadReportData(selectedCycleId, filters);
    }
  }, [selectedCycleId, filters, loadReportData]);

  // Handle cycle selection change
  const handleCycleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCycleId(e.target.value);
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

  // Handle squadron filter toggle
  const handleSquadronToggle = (squadronId: string) => {
    setFilters(prev => {
      const isSelected = prev.squadronIds.includes(squadronId);
      return {
        ...prev,
        squadronIds: isSelected
          ? prev.squadronIds.filter(id => id !== squadronId)
          : [...prev.squadronIds, squadronId]
      };
    });
  };

  // Handle pilot filter toggle
  const handlePilotToggle = (pilotId: string) => {
    setFilters(prev => {
      const isSelected = prev.pilotIds.includes(pilotId);
      return {
        ...prev,
        pilotIds: isSelected
          ? prev.pilotIds.filter(id => id !== pilotId)
          : [...prev.pilotIds, pilotId]
      };
    });
  };

  // Clear all filters
  const handleClearFilters = () => {
    setFilters({
      squadronIds: [],
      pilotIds: []
    });
  };

  // Prepare chart data
  const chartData = reportData ? {
    labels: reportData.chartData.map(d => {
      const date = new Date(d.eventDate);
      return `${d.eventName}\n${date.toLocaleDateString()}`;
    }),
    datasets: [
      {
        label: 'Attendance %',
        data: reportData.chartData.map(d => d.attendancePercentage),
        borderColor: 'rgb(130, 114, 140)',
        backgroundColor: 'rgba(130, 114, 140, 0.1)',
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'No Shows',
        data: reportData.chartData.map(d => d.noShowCount),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.3,
        yAxisID: 'y1'
      },
      {
        label: 'Last Minute Snivels',
        data: reportData.chartData.map(d => d.lastMinuteSniveCount),
        borderColor: 'rgb(251, 191, 36)',
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
        tension: 0.3,
        yAxisID: 'y1'
      }
    ]
  } : null;

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            family: 'Inter',
            size: 12
          }
        }
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
        }
      }
    },
    scales: {
      x: {
        ticks: {
          font: {
            family: 'Inter',
            size: 11
          }
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Attendance %',
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
      y1: {
        type: 'linear' as const,
        display: true,
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

  // Group pilots by squadron for filter UI
  const pilotsBySquadron: Record<string, PilotData[]> = {};
  if (reportData) {
    reportData.pilots.forEach(pilot => {
      const squadronId = pilot.squadronId || 'unassigned';
      if (!pilotsBySquadron[squadronId]) {
        pilotsBySquadron[squadronId] = [];
      }
      pilotsBySquadron[squadronId].push(pilot);
    });
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <div style={{ fontFamily: 'Inter', color: '#64748B' }}>Loading...</div>
      </div>
    );
  }

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
            style={{
              fontFamily: 'Inter',
              fontSize: '14px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              backgroundColor: 'white',
              color: '#1E293B',
              cursor: 'pointer'
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
            disabled={refreshing}
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
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.6 : 1
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
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
              cursor: 'pointer'
            }}
          >
            <Filter size={16} />
            Filters
            {(filters.squadronIds.length > 0 || filters.pilotIds.length > 0) && (
              <span style={{
                backgroundColor: showFilters ? 'white' : '#82728C',
                color: showFilters ? '#82728C' : 'white',
                borderRadius: '10px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                {filters.squadronIds.length + filters.pilotIds.length}
              </span>
            )}
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!reportData}
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
              cursor: reportData ? 'pointer' : 'not-allowed',
              opacity: reportData ? 1 : 0.5
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
          marginBottom: '24px'
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
              color: '#1E293B'
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Squadron filters */}
            <div>
              <h4 style={{
                fontFamily: 'Inter',
                fontSize: '12px',
                fontWeight: 600,
                color: '#64748B',
                marginBottom: '8px',
                textTransform: 'uppercase'
              }}>
                Squadrons
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {reportData.squadrons.map(squadron => (
                  <label
                    key={squadron.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      fontSize: '13px',
                      color: '#1E293B'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filters.squadronIds.includes(squadron.id)}
                      onChange={() => handleSquadronToggle(squadron.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    {squadron.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Pilot filters */}
            <div>
              <h4 style={{
                fontFamily: 'Inter',
                fontSize: '12px',
                fontWeight: 600,
                color: '#64748B',
                marginBottom: '8px',
                textTransform: 'uppercase'
              }}>
                Pilots
              </h4>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                {Object.entries(pilotsBySquadron).map(([squadronId, pilots]) => {
                  const squadron = reportData.squadrons.find(s => s.id === squadronId);
                  return (
                    <div key={squadronId}>
                      {squadron && (
                        <div style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#9CA3AF',
                          marginTop: '8px',
                          marginBottom: '4px',
                          fontFamily: 'Inter'
                        }}>
                          {squadron.name}
                        </div>
                      )}
                      {pilots
                        .sort((a, b) => a.boardNumber.localeCompare(b.boardNumber))
                        .map(pilot => (
                          <label
                            key={pilot.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: 'pointer',
                              fontFamily: 'Inter',
                              fontSize: '13px',
                              color: '#1E293B',
                              marginLeft: '12px'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={filters.pilotIds.includes(pilot.id)}
                              onChange={() => handlePilotToggle(pilot.id)}
                              style={{ cursor: 'pointer' }}
                            />
                            {pilot.boardNumber} - {pilot.callsign}
                          </label>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData && (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '24px',
          height: '500px'
        }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      )}

      {!reportData && !loading && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#64748B',
          fontFamily: 'Inter'
        }}>
          No data available for the selected cycle
        </div>
      )}
    </div>
  );
};

export default CycleAttendanceReport;
