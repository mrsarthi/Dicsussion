import React from 'react';
import { formatAddress } from '../blockchain/web3Provider';
import './CreateGroupModal.css'; // Re-use styles

export function GroupDetailsModal({ group, onClose, myAddress, onDeleteGroup, onRemoveMember }) {
    if (!group) return null;

    const members = group.members || [];
    // Fallback for groups created before admin feature: treat first member as admin
    const admins = (group.admins && group.admins.length > 0) ? group.admins : (members.length > 0 ? [members[0]] : []);
    const isAdmin = admins.some(a => a.toLowerCase() === myAddress?.toLowerCase());

    const handleDeleteGroup = () => {
        if (!window.confirm(`Delete "${group.username || 'this group'}"?\n\nThis will remove the group and all its messages from your device. Other members will still have their copy.`)) return;
        onDeleteGroup?.(group.address);
        onClose();
    };

    const handleRemoveMember = (memberAddr) => {
        const displayName = formatAddress(memberAddr);
        if (!window.confirm(`Remove ${displayName} from the group?`)) return;
        onRemoveMember?.(group.address, memberAddr);
    };

    return (
        <div className="modal-overlay animate-fadeIn" onClick={onClose}>
            <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>👥 Group Details</h3>
                    <button className="close-modal-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    <div className="group-info-section">
                        <h4>{group.username || 'Unnamed Group'}</h4>
                        <p className="text-muted text-sm">{members.length} members</p>
                    </div>

                    <div className="members-list-container">
                        <h5>Members</h5>
                        <div className="members-list">
                            {members.map(memberAddr => {
                                const isSelf = memberAddr.toLowerCase() === myAddress?.toLowerCase();
                                const isMemberAdmin = admins.includes(memberAddr);
                                return (
                                    <div key={memberAddr} className="member-item">
                                        <div className="avatar small">
                                            {memberAddr.slice(2, 4).toUpperCase()}
                                        </div>
                                        <div className="member-info">
                                            <span className="member-name">
                                                {isSelf ? 'You' : formatAddress(memberAddr)}
                                            </span>
                                            <span className="member-address text-xs text-muted">
                                                {memberAddr}
                                            </span>
                                        </div>
                                        {isMemberAdmin && (
                                            <span className="admin-badge">Admin</span>
                                        )}
                                        {isAdmin && !isSelf && !isMemberAdmin && (
                                            <button
                                                className="btn-remove-member"
                                                onClick={() => handleRemoveMember(memberAddr)}
                                                title="Remove member"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="modal-footer" style={{ flexDirection: 'column', gap: '8px' }}>
                    {isAdmin && (
                        <button className="btn btn-danger full-width" onClick={handleDeleteGroup}>
                            🗑️ Delete Group
                        </button>
                    )}
                    <button className="btn btn-secondary full-width" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
