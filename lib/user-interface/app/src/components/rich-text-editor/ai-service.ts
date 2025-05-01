import { ApiClient } from "../../common/api-client/api-client";
import { Utils } from "../../common/utils";

export interface AiGenerationRequest {
  prompt: string;
  sessionId: string;
  documentIdentifier: string;
  sectionTitle: string;
}

export interface AiGenerationResponse {
  content: string;
  success: boolean;
  error?: string;
}

export class AiService {
  private apiClient: ApiClient;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Generates content for a document section using Claude API via AWS Bedrock
   */
  async generateSectionContent(request: AiGenerationRequest): Promise<AiGenerationResponse> {
    try {
      // Get authentication token
      const token = await Utils.authenticate();
      
      // In a real implementation, this would call your backend API that interfaces with Claude
      // For now, we'll simulate a response with a timeout
      
      // Create a prompt for the section
      const systemPrompt = `
        You are an AI assistant helping to draft a grant proposal narrative document. 
        You are specifically writing content for the "${request.sectionTitle}" section.
        Generate professional, well-structured content that would be appropriate for a government grant application.
        Focus on being clear, specific, and persuasive.
        Include appropriate headings, bullet points, and formatting as needed.
        
        The content should be appropriate for the USDA Forest Service Urban & Community Forestry Inflation Reduction Act grant.
        For the City of Springfield, Massachusetts, in partnership with the Public Health Institute of Western Massachusetts.
      `;
      
      // In a real implementation, this would send a request to your backend
      // which would then call the Claude API via AWS Bedrock
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate a response based on the section title
      let responseContent = '';
      
      switch(request.sectionTitle) {
        case 'Executive Summary':
          responseContent = `
            <h1>Executive Summary</h1>
            <p>The City of Springfield, Massachusetts, in partnership with the Public Health Institute of Western Massachusetts, proposes the "Green and Resilient Springfield" initiative to address urban heat islands, improve air quality, and enhance community resilience through strategic urban forestry interventions. This comprehensive project will engage community members, enhance ecosystem services, and advance environmental justice in underserved neighborhoods.</p>
            <p>Key components include:</p>
            <ul>
              <li><strong>Tree Planting and Maintenance:</strong> Planting 1,500 native trees in priority neighborhoods identified through heat vulnerability mapping.</li>
              <li><strong>Green Infrastructure Integration:</strong> Implementing rain gardens and bioswales in conjunction with tree planting to manage stormwater runoff.</li>
              <li><strong>Workforce Development:</strong> Training 30 residents in urban forestry skills, creating pathways to green careers.</li>
              <li><strong>Community Engagement:</strong> Involving residents in all aspects of planning, implementation, and stewardship.</li>
            </ul>
            <p>The proposed initiative aligns with USDA Forest Service Urban & Community Forestry program goals and will leverage existing city infrastructure and community partnerships to ensure long-term success and sustainability.</p>
          `;
          break;
        case 'Project Description':
          responseContent = `
            <h1>Project Description</h1>
            <p>The "Green and Resilient Springfield" initiative addresses critical environmental and public health challenges facing Springfield's urban communities through strategic urban forestry interventions. Springfield faces significant urban heat island effects, with some neighborhoods experiencing temperatures up to 10°F higher than surrounding areas during summer months.</p>
            
            <h2>Project Context</h2>
            <p>Springfield is Massachusetts' third-largest city, with approximately 155,000 residents across diverse neighborhoods. Recent analyses have identified significant disparities in tree canopy coverage:</p>
            <ul>
              <li>Affluent neighborhoods: 35-40% canopy cover</li>
              <li>Environmental justice neighborhoods: 10-15% canopy cover</li>
            </ul>
            <p>These disparities correlate with higher rates of asthma, heat-related illness, and other health conditions in underserved areas.</p>
            
            <h2>Proposed Activities</h2>
            <p>Our project will implement the following key activities:</p>
            <h3>1. Strategic Tree Planting</h3>
            <p>We will plant 1,500 native trees over three years, prioritizing species diversity for climate resilience. Planting locations have been identified through GIS analysis of heat vulnerability, population density, and existing tree canopy.</p>
            
            <h3>2. Green Infrastructure Integration</h3>
            <p>Where appropriate, tree planting will be integrated with green stormwater infrastructure, including:</p>
            <ul>
              <li>Rain gardens in public parks and school grounds</li>
              <li>Tree pits with enhanced stormwater capacity</li>
              <li>Permeable surfaces around new plantings</li>
            </ul>
            
            <h3>3. Workforce Development</h3>
            <p>We will train 30 residents from target neighborhoods in urban forestry skills including planting, maintenance, and basic arboriculture. This program will create pathways to employment while building community capacity for tree care.</p>
            
            <h3>4. Community Science and Engagement</h3>
            <p>Residents will be engaged as partners throughout the project, participating in:</p>
            <ul>
              <li>Tree inventory and monitoring activities</li>
              <li>Neighborhood tree committees</li>
              <li>Educational workshops and events</li>
            </ul>
          `;
          break;
        case 'Project Goals and Objectives':
          responseContent = `
            <h1>Project Goals and Objectives</h1>
            <p>The "Green and Resilient Springfield" initiative is guided by clear goals and measurable objectives designed to create meaningful environmental and social impacts.</p>
            
            <h2>Goal 1: Expand and Enhance Urban Tree Canopy</h2>
            <p><strong>Objectives:</strong></p>
            <ul>
              <li>Increase urban tree canopy in targeted neighborhoods by 5% within 5 years of project completion</li>
              <li>Achieve a 90% three-year survival rate for newly planted trees</li>
              <li>Plant a diverse palette of at least 25 native tree species to enhance resilience</li>
              <li>Establish 15 new pocket parks or green spaces in previously paved areas</li>
            </ul>
            
            <h2>Goal 2: Mitigate Urban Heat Island Effect</h2>
            <p><strong>Objectives:</strong></p>
            <ul>
              <li>Reduce summertime surface temperatures in target areas by 2-3°F within 5 years of project completion</li>
              <li>Increase shaded area along key pedestrian corridors by 30%</li>
              <li>Create 10 "cool zones" in high-use public spaces through strategic tree planting</li>
            </ul>
            
            <h2>Goal 3: Build Community Capacity and Environmental Stewardship</h2>
            <p><strong>Objectives:</strong></p>
            <ul>
              <li>Train 30 residents in urban forestry skills with at least 75% completing the full program</li>
              <li>Establish neighborhood tree committees in all 8 target neighborhoods</li>
              <li>Engage at least 1,000 residents in project activities over three years</li>
              <li>Achieve 90% resident satisfaction with project outcomes as measured by post-implementation surveys</li>
            </ul>
            
            <h2>Goal 4: Improve Stormwater Management</h2>
            <p><strong>Objectives:</strong></p>
            <ul>
              <li>Capture and infiltrate an estimated 500,000 gallons of stormwater annually through green infrastructure</li>
              <li>Reduce impervious surface area by 2 acres across the project area</li>
              <li>Implement 25 integrated tree pit and bioswale installations</li>
            </ul>
            
            <p>These SMART (Specific, Measurable, Achievable, Relevant, Time-bound) objectives provide a framework for project implementation and evaluation, ensuring accountability and focus on measurable outcomes.</p>
          `;
          break;
        case 'Project Timeline':
          responseContent = `
            <h1>Project Timeline</h1>
            <p>The "Green and Resilient Springfield" initiative will be implemented over a three-year period, with key activities organized seasonally to optimize planting success and community engagement.</p>
            
            <h2>Year 1 (2024)</h2>
            <h3>Quarter 1 (January-March)</h3>
            <ul>
              <li>Finalize planting locations and species selection for Year 1</li>
              <li>Develop community engagement materials and outreach strategy</li>
              <li>Recruit first cohort of 10 workforce development participants</li>
              <li>Establish project steering committee with community representatives</li>
            </ul>
            
            <h3>Quarter 2 (April-June)</h3>
            <ul>
              <li>Conduct Spring planting of 250 trees</li>
              <li>Launch neighborhood tree committees in 4 priority neighborhoods</li>
              <li>Begin workforce training program (cohort 1)</li>
              <li>Implement initial 5 integrated stormwater management installations</li>
            </ul>
            
            <h3>Quarter 3 (July-September)</h3>
            <ul>
              <li>Perform maintenance and monitoring of newly planted trees</li>
              <li>Host summer tree stewardship workshops in each target neighborhood</li>
              <li>Conduct baseline temperature monitoring in project areas</li>
              <li>Complete site preparation for Fall planting</li>
            </ul>
            
            <h3>Quarter 4 (October-December)</h3>
            <ul>
              <li>Conduct Fall planting of 250 trees</li>
              <li>Complete first cohort of workforce development program</li>
              <li>Conduct Year 1 evaluation and prepare progress report</li>
              <li>Plan for Year 2 activities based on lessons learned</li>
            </ul>
            
            <h2>Year 2 (2025)</h2>
            <p>Key activities include:</p>
            <ul>
              <li>Plant additional 500 trees (250 Spring, 250 Fall)</li>
              <li>Expand to remaining 4 target neighborhoods</li>
              <li>Train second cohort of 10 workforce development participants</li>
              <li>Implement 10 additional stormwater management installations</li>
              <li>Launch community science temperature monitoring program</li>
            </ul>
            
            <h2>Year 3 (2026)</h2>
            <p>Key activities include:</p>
            <ul>
              <li>Plant final 500 trees (250 Spring, 250 Fall)</li>
              <li>Train third cohort of 10 workforce development participants</li>
              <li>Implement remaining stormwater management installations</li>
              <li>Conduct comprehensive project evaluation</li>
              <li>Develop sustainability plan for long-term maintenance and community stewardship</li>
            </ul>
            
            <p>Throughout all three years, continuous community engagement, tree maintenance, and monitoring activities will be conducted to ensure project success and sustainability.</p>
          `;
          break;
        case 'Budget Narrative':
          responseContent = `
            <h1>Budget Narrative</h1>
            <p>The "Green and Resilient Springfield" initiative requires a comprehensive budget of $1,500,000 over three years to achieve its goals and objectives. This budget narrative provides justification for each major expenditure category.</p>
            
            <h2>Personnel ($450,000)</h2>
            <p>Personnel costs include:</p>
            <ul>
              <li><strong>Project Manager (0.75 FTE):</strong> $195,000 ($65,000/year × 3 years) - Responsible for overall project coordination, reporting, and stakeholder engagement</li>
              <li><strong>Urban Forestry Specialist (1.0 FTE):</strong> $180,000 ($60,000/year × 3 years) - Provides technical expertise on tree selection, planting, and maintenance</li>
              <li><strong>Community Outreach Coordinator (0.5 FTE):</strong> $75,000 ($25,000/year × 3 years) - Coordinates community engagement activities and volunteer recruitment</li>
            </ul>
            
            <h2>Fringe Benefits ($112,500)</h2>
            <p>Calculated at 25% of personnel costs, covering health insurance, retirement contributions, and payroll taxes.</p>
            
            <h2>Materials and Supplies ($375,000)</h2>
            <ul>
              <li><strong>Trees and Planting Materials:</strong> $300,000
                <ul>
                  <li>1,500 trees at an average cost of $150 per tree (includes 2" caliper trees, soil amendments, mulch, and initial stakes/guards)</li>
                  <li>Unit cost is based on current market rates and previous municipal planting projects</li>
                </ul>
              </li>
              <li><strong>Green Infrastructure Materials:</strong> $50,000
                <ul>
                  <li>Materials for rain gardens, enhanced tree pits, and bioswales</li>
                  <li>Includes soil media, plants, drainage materials, and edging</li>
                </ul>
              </li>
              <li><strong>Maintenance Supplies:</strong> $25,000
                <ul>
                  <li>Watering equipment, replacement stakes/guards, pruning tools, etc.</li>
                </ul>
              </li>
            </ul>
            
            <h2>Contractual Services ($300,000)</h2>
            <ul>
              <li><strong>Planting Contractor:</strong> $150,000
                <ul>
                  <li>Professional services for larger street tree installations requiring specialized equipment</li>
                  <li>Estimated at $100 per tree for approximately 1,500 trees</li>
                </ul>
              </li>
              <li><strong>Workforce Development Trainer:</strong> $90,000
                <ul>
                  <li>Specialized training in arboriculture and urban forestry practices</li>
                  <li>$30,000 per year for curriculum development and implementation</li>
                </ul>
              </li>
              <li><strong>Evaluation Consultant:</strong> $60,000
                <ul>
                  <li>External evaluation of project outcomes and impacts</li>
                  <li>Includes baseline, midpoint, and final assessment</li>
                </ul>
              </li>
            </ul>
            
            <h2>Participant Support ($150,000)</h2>
            <ul>
              <li><strong>Workforce Development Stipends:</strong> $120,000
                <ul>
                  <li>$4,000 stipend per participant × 30 participants over 3 years</li>
                </ul>
              </li>
              <li><strong>Community Event Support:</strong> $30,000
                <ul>
                  <li>Materials, refreshments, and supplies for community events and workshops</li>
                </ul>
              </li>
            </ul>
            
            <h2>Equipment ($75,000)</h2>
            <ul>
              <li><strong>Temperature Monitoring Equipment:</strong> $25,000
                <ul>
                  <li>Weather stations and heat sensors for project evaluation</li>
                </ul>
              </li>
              <li><strong>Maintenance Equipment:</strong> $50,000
                <ul>
                  <li>Water tank, utility vehicle, and maintenance tools</li>
                </ul>
              </li>
            </ul>
            
            <h2>Indirect Costs ($37,500)</h2>
            <p>Calculated at 10% of direct costs, covering administrative overhead, office space, utilities, and basic office supplies.</p>
            
            <p>This budget has been carefully developed to ensure efficient use of grant funds while maximizing project impact. The City of Springfield will provide $300,000 in matching funds through in-kind staff time, equipment use, and direct financial contribution.</p>
          `;
          break;
        default:
          responseContent = `<p>This is AI-generated content for the ${request.sectionTitle} section.</p>`;
      }
      
      return {
        content: responseContent,
        success: true
      };
    } catch (error) {
      console.error('Error generating AI content:', error);
      return {
        content: '',
        success: false,
        error: 'Failed to generate content. Please try again.'
      };
    }
  }
}