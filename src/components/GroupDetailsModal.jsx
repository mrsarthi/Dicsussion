import React from 'react';
import { formatAddress } from '../blockchain/web3Provider';
import './CreateGroupModal.css'; // Re-use styles

export function GroupDetailsModal({ group, onClose, myAddress }) {
    if (!group) return null;

    const members = group.members || [];
    const admins = group.admins || [];

    return (
        <div className="modal-overlay animate-fadeIn" onClick={onClose}>
            <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>👥 Group Details</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    <div className="group-info-section">
                        <h4>{group.username || 'Unnamed Group'}</h4>
                        <p className="text-muted text-sm">{members.length} members</p>
                    </div>

                    <div className="members-list-container">
                        <h5>Members</h5>
                        <div className="members-list">
                            {members.map(memberAddr => (
                                <div key={memberAddr} className="member-item">
                                    <div className="avatar small">
                                        {memberAddr.slice(2, 4).toUpperCase()}
                                    </div>
                                    <div className="member-info">
                                        <span className="member-name">
                                            {memberAddr.toLowerCase() === myAddress?.toLowerCase()
                                                ? 'You'
                                                : formatAddress(memberAddr)}
                                        </span>
                                        <span className="member-address text-xs text-muted">
                                            {memberAddr}
                                        </span>
                                    </div>
                                    {admins.includes(memberAddr) && (
                                        <span className="admin-badge">Admin</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary full-width" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
