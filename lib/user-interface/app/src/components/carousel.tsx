import Carousel from 'react-multi-carousel';
import {ResponsiveType} from 'react-multi-carousel/lib/types';
// import 'react-multi-carousel/lib/styles.css';
import {TaskCard} from '../components/caro-card';
import {v4 as uuidv4} from "uuid";
import {Mode} from "@cloudscape-design/global-styles";

interface CarouselNextProps {
    theme: Mode;
    documents: Array<{ label: string; value: string }>;
}

const CarouselNext = ({ theme, documents }: CarouselNextProps) => {
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    const BreakpointSlides: ResponsiveType = {
        desktop: {
            breakpoint: {max: 3000, min: 1024},
            items: 3,
            partialVisibilityGutter: 0
        },
        tablet: {
            breakpoint: {max: 1024, min: 530},
            items: 2,
            partialVisibilityGutter: 0
        },
        mobile: {
            breakpoint: {max: 530, min: 0},
            items: 1,
            partialVisibilityGutter: 0
        },
    };

    const renderTaskCard = (doc: { label: string; value: string }) => (
        <TaskCard
          key={uuidv4()}
          name={doc.value}
          cardTitle={doc.label}
          taskDescription={`Details about ${doc.label}`}
          instructions="Select to view details"
          url={`/chatbot/task-playground/${uuidv4()}`}
          theme={theme}
        />
    );

    const renderPlaceholderCard = (index: number) => (
        <TaskCard
          key={`placeholder-${index}`}
          name={`placeholder-${index}`}
          cardTitle={`Sample Task ${index + 1}`}
          taskDescription="This is a sample task card for demonstration."
          instructions="Click to learn more"
          url={`/chatbot/task-playground/${uuidv4()}`}
          theme={theme}
        />
    );


    // Render either real documents or 3 placeholders
    const content = documents.length
    ? documents.map((doc) => renderTaskCard(doc))
    : Array.from({ length: 3 }, (_, index) => renderPlaceholderCard(index)); 


    return (
        <Carousel
            responsive={BreakpointSlides}
            //itemClass="carousel-item"
            //containerClass="carousel-container"
            autoPlay={!prefersReducedMotion}
            slidesToSlide={1}
            // additionalTransfrom={0}
            // arrows
            autoPlaySpeed={3000}
            // centerMode={false}
            draggable
            focusOnSelect={true}
            // infinite={false}
            //keyBoardControl
            //minimumTouchDrag={80}
            pauseOnHover
            //renderArrowsWhenDisabled={false}
            //renderButtonGroupOutside={false}
            //renderDotsOutside={false}
            rewind={!prefersReducedMotion}
            rewindWithAnimation={!prefersReducedMotion}
            //rtl={false}
            shouldResetAutoplay={!prefersReducedMotion}
            //showDots={false}
            //swipeable
        >
            {content}
            {/* <TaskCard
                name="ccg-grant"
                cardTitle="Community Change Grant"
                taskDescription="Assist with "
                instructions="Select to view requirements"
                url={`/chatbot/task-playground/${uuidv4()}/summarize`}
                theme={theme}
            /> */}
            {/* <TaskCard
                name="DEG"
                cardTitle="Digital Equity"
                taskDescription="Assist with "
                instructions="Select to view requirements"
                url={`/chatbot/task-playground/${uuidv4()}/translate`}
                theme={theme}
            /> */}
            {/* {documents.map((doc) => (
                <TaskCard
                key={uuidv4()}
                name={doc.value}
                cardTitle={doc.label}
                taskDescription={`View details of ${doc.label}`}
                instructions="Select to view requirements"
                url={`/chatbot/task-playground/${uuidv4()}/summarize`}
                theme={theme}
                />
            ))} */}
        </Carousel>
   );
};

export default CarouselNext;