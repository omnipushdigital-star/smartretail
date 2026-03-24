const activeItems = [
    {
        playlist_item_id: 'pizza-id',
        is_scheduled: true,
        start_date: '2026-03-23',
        end_date: '2026-03-23',
        start_time: '22:01:00',
        end_time: '22:05:00',
        days_of_week: [0, 1, 2, 3, 4, 5, 6]
    }
]

const currentTime = new Date('2026-03-23T22:29:16+05:30') // Past 22:05 in IST

const filtered = activeItems.filter(item => {
    if (!item.is_scheduled) return true

    // 1. Date Range Check
    if (item.start_date) {
        const start = new Date(item.start_date)
        if (currentTime < start) return false
    }
    if (item.end_date) {
        const end = new Date(item.end_date)
        end.setHours(23, 59, 59, 999)
        if (currentTime > end) return false
    }

    // 2. Day of Week Check
    if (item.days_of_week && item.days_of_week.length > 0) {
        if (!item.days_of_week.includes(currentTime.getDay())) return false
    }

    // 3. Time Check (Dayparting)
    if (item.start_time || item.end_time) {
        const nowSecs = currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds()
        if (item.start_time) {
            const [h, m, s] = item.start_time.split(':').map(Number)
            if (nowSecs < (h * 3600 + (m || 0) * 60 + (s || 0))) return false
        }
        if (item.end_time) {
            const [h, m, s] = item.end_time.split(':').map(Number)
            if (nowSecs > (h * 3600 + (m || 0) * 60 + (s || 0))) return false
        }
    }

    return true
})

console.log("Filtered length: ", filtered.length)
// Expect 0 since it's 22:29 and it ends at 22:05
