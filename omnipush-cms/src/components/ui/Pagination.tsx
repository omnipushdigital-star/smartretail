import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
    page: number
    totalPages: number
    totalItems: number
    pageSize: number
    onPageChange: (page: number) => void
}

export default function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
    if (totalItems === 0) return null
    const start = (page - 1) * pageSize + 1
    const end = Math.min(page * pageSize, totalItems)

    return (
        <div className="pagination">
            <span style={{ marginRight: 'auto' }}>
                Showing {start}–{end} of {totalItems}
            </span>
            <button className="page-btn" onClick={() => onPageChange(page - 1)} disabled={page === 1}>
                <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = i + 1
                if (totalPages > 5) {
                    if (page <= 3) pageNum = i + 1
                    else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = page - 2 + i
                }
                return (
                    <button
                        key={pageNum}
                        className={`page-btn${pageNum === page ? ' current' : ''}`}
                        onClick={() => onPageChange(pageNum)}
                    >
                        {pageNum}
                    </button>
                )
            })}
            <button className="page-btn" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>
                <ChevronRight size={14} />
            </button>
        </div>
    )
}
