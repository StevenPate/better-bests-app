import { REGIONS, getRegionByAbbreviation } from '@/config/regions';
import { RegionError } from '@/lib/errors';

export class DateUtils {
  static getMostRecentWednesday(): Date {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 3 = Wednesday
    const daysToSubtract = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
    const wednesday = new Date(today);
    wednesday.setDate(today.getDate() - daysToSubtract);
    return wednesday;
  }

  static getPreviousWednesday(): Date {
    const recentWednesday = this.getMostRecentWednesday();
    const previousWednesday = new Date(recentWednesday);
    previousWednesday.setDate(recentWednesday.getDate() - 7);
    return previousWednesday;
  }

  static formatAsYYMMDD(date: Date): string {
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
  }

  static getListUrls(): { current: string; previous: string } {
    const currentWednesday = this.getMostRecentWednesday();
    const previousWednesday = this.getPreviousWednesday();

    const currentDate = this.formatAsYYMMDD(currentWednesday);
    const previousDate = this.formatAsYYMMDD(previousWednesday);

    return {
      current: `https://www.bookweb.org/sites/default/files/regional_bestseller/${currentDate}pn.txt`,
      previous: `https://www.bookweb.org/sites/default/files/regional_bestseller/${previousDate}pn.txt`
    };
  }

  /**
   * Get regional bestseller list URLs for a specific region
   * @param regionCode - Region abbreviation (e.g., 'PNBA', 'SIBA')
   * @param weekDate - Optional specific week date (defaults to current week)
   * @returns Object with current and previous week URLs
   */
  static getRegionalListUrls(regionCode: string, weekDate?: Date): { current: string; previous: string } {
    const region = getRegionByAbbreviation(regionCode);
    if (!region) {
      throw new RegionError(
        { regionCode, operation: 'getRegionalListUrls' },
        `Unknown region: ${regionCode}`
      );
    }

    const currentWednesday = weekDate || this.getMostRecentWednesday();
    const previousWednesday = new Date(currentWednesday);
    previousWednesday.setDate(currentWednesday.getDate() - 7);

    const currentDate = this.formatAsYYMMDD(currentWednesday);
    const previousDate = this.formatAsYYMMDD(previousWednesday);

    const baseUrl = 'https://www.bookweb.org/sites/default/files/regional_bestseller/';
    return {
      current: `${baseUrl}${currentDate}${region.file_code}.txt`,
      previous: `${baseUrl}${previousDate}${region.file_code}.txt`
    };
  }

  /**
   * Generate an array of Wednesday dates going back N weeks
   * @param startDate - Starting Wednesday date
   * @param weeks - Number of weeks to generate
   * @returns Array of Date objects (most recent first)
   */
  static generateWeekRange(startDate: Date, weeks: number): Date[] {
    const dates: Date[] = [];
    for (let i = 0; i < weeks; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() - (i * 7));
      dates.push(date);
    }
    return dates;
  }

  /**
   * Get bestseller list URLs for all active regions for a specific week
   * @param weekDate - Wednesday date for the list
   * @returns Array of objects with region and URL
   */
  static getAllRegionUrls(weekDate: Date): Array<{ region: string; url: string; fileCode: string }> {
    const yymmdd = this.formatAsYYMMDD(weekDate);
    const baseUrl = 'https://www.bookweb.org/sites/default/files/regional_bestseller/';

    return REGIONS
      .filter(r => r.is_active)
      .map(region => ({
        region: region.abbreviation,
        url: `${baseUrl}${yymmdd}${region.file_code}.txt`,
        fileCode: region.file_code
      }));
  }

  /**
   * Format date as ISO date string (YYYY-MM-DD)
   * @param date - Date to format
   * @returns ISO date string
   */
  static formatAsISO(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}