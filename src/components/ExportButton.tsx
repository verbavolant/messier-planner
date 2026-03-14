import type { ScheduleResult } from '../types';

interface Props {
  result: ScheduleResult;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('it-IT', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function ExportButton({ result }: Props) {
  const handleExport = () => {
    const header = '#,Messier,NGC,Name,Type,Constellation,RA_h,Dec_deg,Magnitude,StartTime,EndTime,Altitude_deg,Azimuth_deg,Exposure_s,FOV_Group,Status';

    const rows = result.scheduledObjects.map(s => [
      s.order,
      s.object.messier,
      s.object.ngc,
      s.object.name,
      s.object.type,
      s.object.constellation,
      s.object.ra.toFixed(3),
      s.object.dec.toFixed(3),
      s.object.magnitude.toFixed(1),
      formatDateTime(s.startTime),
      formatDateTime(s.endTime),
      s.altitude.toFixed(1),
      s.azimuth.toFixed(1),
      s.exposureSec,
      s.fovGroup || '',
      s.status,
    ].join(','));

    const csv = [header, ...rows].join('\n');

    // Add metadata as comments at the top
    const meta = [
      `# Messier Marathon Plan`,
      `# Date: ${result.nightStart.toLocaleDateString('it-IT')}`,
      `# Night start: ${formatDateTime(result.nightStart)}`,
      `# Night end: ${formatDateTime(result.nightEnd)}`,
      `# Objects scheduled: ${result.scheduledObjects.length}`,
      `# Total time: ${result.totalTimeMin.toFixed(0)} min`,
      `# Fits before dawn: ${result.fitsBeforeDawn ? 'Yes' : 'No'}`,
      '',
    ].join('\n');

    const blob = new Blob([meta + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `messier-marathon-${result.nightStart.toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button className="btn-export" onClick={handleExport}>
      Export Plan (CSV)
    </button>
  );
}
