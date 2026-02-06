import { useState } from 'react';
import { formatAddress } from '../blockchain/web3Provider';
import './CreateGroupModal.css';

export function CreateGroupModal({ contacts, onClose, onCreate }) {
    const [groupName, setGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState([]);

    const toggleMember = (address) => {
        if (selectedMembers.includes(address)) {
            setSelectedMembers(prev => prev.filter(a => a !== address));
        } else {
            setSelectedMembers(prev => [...prev, address]);
        }
    };

    const handleCreate = () => {
        if (!groupName.trim() || selectedMembers.length === 0) return;
        onCreate(groupName, selectedMembers);
        onClose();
    };

    // Filter out existing groups from contacts list
    const availableContacts = contacts.filter(c => !c.isGroup);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                <header className="modal-header">
                    <h3>Create New Group</h3>
                    <button className="close-modal-btn" onClick={onClose}>×</button>
                </header>

                <div className="modal-body">
                    <label className="block mb-2 text-sm font-medium">Group Name</label>
                    <input
                        type="text"
                        className="input group-name-input"
                        placeholder="e.g. Project Alpha"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        autoFocus
                    />

                    <label className="block mb-2 text-sm font-medium">Select Members</label>
                    <div className="members-selection">
                        {availableContacts.length === 0 ? (
                            <p className="text-muted text-sm text-center py-4">
                                No contacts available. Start some chats first!
                            </p>
                        ) : (
                            availableContacts.map(contact => (
                                <div
                                    key={contact.address}
                                    className={`member-option ${selectedMembers.includes(contact.address) ? 'selected' : ''}`}
                                    onClick={() => toggleMember(contact.address)}
                                >
                                    <div className="checkbox-visual">✓</div>
                                    <div className="avatar small">
                                        {contact.address.slice(2, 4).toUpperCase()}
                                    </div>
                                    <div className="member-info-row">
                                        <span className="font-medium">{contact.username || 'Unknown'}</span>
                                        <span className="member-addr">{formatAddress(contact.address)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <footer className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        disabled={!groupName.trim() || selectedMembers.length === 0}
                        onClick={handleCreate}
                    >
                        Create Group
                    </button>
                </footer>
            </div>
        </div>
    );
}
