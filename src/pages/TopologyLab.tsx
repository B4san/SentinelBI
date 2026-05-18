import React, { useCallback, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  addEdge,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../store';
import { Badge } from '../components/ui/badge';
import { BrainCircuit, Database, Shield, CheckCircle2, AlertTriangle, Eye, ArrowRightLeft, Save } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';

const baseNodeStyle = { background: '#ffffff', color: '#111827', border: 'none', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)', fontSize: '13px', fontWeight: 600 };

const initialNodesTemplate: Node[] = [
  {
    id: 'intake',
    type: 'input',
    position: { x: 50, y: 300 },
    data: { label: 'Intake Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #3b82f6' }
  },
  {
    id: 'sec',
    position: { x: 250, y: 150 },
    data: { label: 'Security Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #ef4444' }
  },
  {
    id: 'gov',
    position: { x: 450, y: 50 },
    data: { label: 'Governance Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #eab308' }
  },
  {
    id: 'schema',
    position: { x: 250, y: 300 },
    data: { label: 'Schema Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #64748b' }
  },
  {
    id: 'quality',
    position: { x: 450, y: 300 },
    data: { label: 'Data Quality Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #64748b' }
  },
  {
    id: 'orch',
    position: { x: 650, y: 300 },
    data: { label: 'Orchestrator Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #8b5cf6', background: '#f5f3ff', color: '#6d28d9' }
  },
  {
    id: 'analytics',
    position: { x: 850, y: 200 },
    data: { label: 'Analytics Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #14b8a6' }
  },
  {
    id: 'forecast',
    position: { x: 850, y: 300 },
    data: { label: 'Forecasting Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #3b82f6' }
  },
  {
    id: 'visual',
    position: { x: 850, y: 400 },
    data: { label: 'Visual Code Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #ec4899' }
  },
  {
    id: 'explain',
    type: 'output',
    position: { x: 1100, y: 300 },
    data: { label: 'Explainability Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #10b981' }
  },
  {
    id: 'export',
    type: 'output',
    position: { x: 1100, y: 400 },
    data: { label: 'Export Agent' },
    style: { ...baseNodeStyle, borderLeft: '4px solid #f59e0b' }
  }
];

const initialEdgesTemplate: Edge[] = [
  { id: 'e1', source: 'intake', target: 'sec', animated: true, label: 'Inspect', style: { stroke: '#94a3b8' } },
  { id: 'e2', source: 'sec', target: 'gov', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e3', source: 'intake', target: 'schema', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e4', source: 'schema', target: 'quality', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e5', source: 'quality', target: 'orch', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e6', source: 'sec', target: 'orch', animated: true, label: 'Safe Pass', style: { stroke: '#94a3b8' } },
  { id: 'e7', source: 'gov', target: 'orch', animated: true, label: 'Policy Apply', style: { stroke: '#94a3b8' } },
  { id: 'e8', source: 'orch', target: 'analytics', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e9', source: 'orch', target: 'forecast', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e10', source: 'orch', target: 'visual', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e11', source: 'analytics', target: 'explain', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e12', source: 'forecast', target: 'explain', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e13', source: 'visual', target: 'explain', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e14', source: 'explain', target: 'export', animated: true, style: { stroke: '#94a3b8' } },
  { id: 'e15', source: 'visual', target: 'export', animated: true, style: { stroke: '#94a3b8' } }
];

export function TopologyLab() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const saveTopology = useStore(state => state.saveTopology);
  const activeSpace = spaces.find(s => s.id === spaceId);

  const initialNodes = activeSpace?.topologyNodes?.length ? activeSpace.topologyNodes : initialNodesTemplate;
  const initialEdges = activeSpace?.topologyEdges?.length ? activeSpace.topologyEdges : initialEdgesTemplate;

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  // Sync state if space changes
  useEffect(() => {
     setNodes(initialNodes);
     setEdges(initialEdges);
  }, [spaceId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );
  
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: '#94a3b8' } }, eds)),
    [setEdges]
  );

  const handleSave = () => {
    if (spaceId) {
      saveTopology(spaceId, nodes, edges);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
        <div>
           <h2 className="text-[28px] font-bold tracking-tight text-gray-900">Agent Topology Lab</h2>
           <p className="text-gray-500 mt-1 font-medium text-[15px]">Visually manage multi-agent communication and secure execution zones for this workspace.</p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
           <Badge variant="outline" className="bg-white px-3 py-1.5 shadow-sm text-gray-700 font-semibold border-gray-200">
             <BrainCircuit className="w-3.5 h-3.5 mr-1.5 text-blue-500"/> {nodes.length} Active Models
           </Badge>
           <Badge variant="outline" className="bg-emerald-50 text-emerald-600 px-3 py-1.5 shadow-sm font-semibold border-emerald-100">
             Execution Flow Active
           </Badge>
           <Button variant="default" size="sm" onClick={handleSave} className="shadow-md ml-2">
              <Save className="w-4 h-4 mr-2" /> Save Architecture
           </Button>
        </div>
      </div>

      <Card className="flex-1 w-full relative overflow-hidden border-none soft-shadow bg-gray-50/50 rounded-3xl">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          colorMode="light"
        >
          <Background color="#cbd5e1" gap={16} size={2} />
          <Controls className="bg-white shadow-md border-gray-100 fill-gray-700" />
          <Panel position="top-right" className="bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-gray-100 shadow-xl max-w-sm mt-4 mr-4">
            <h3 className="font-bold text-gray-900 mb-3 text-[15px]">Topology Security Guardrails</h3>
            <ul className="text-sm space-y-3 text-gray-600 font-medium">
                <li className="flex items-start leading-relaxed">
                  <div className="p-1 rounded bg-rose-50 mr-3 mt-0.5">
                    <Shield className="w-4 h-4 text-rose-500 shrink-0" />
                  </div>
                  All user inputs MUST traverse the Security Agent (Lobster Trap) before Orchestrator.
                </li>
                <li className="flex items-start leading-relaxed">
                  <div className="p-1 rounded bg-amber-50 mr-3 mt-0.5">
                    <Eye className="w-4 h-4 text-amber-500 shrink-0" />
                  </div>
                  Governance Agent monitors orchestration routing.
                </li>
            </ul>
          </Panel>
        </ReactFlow>
      </Card>
    </div>
  );
}
