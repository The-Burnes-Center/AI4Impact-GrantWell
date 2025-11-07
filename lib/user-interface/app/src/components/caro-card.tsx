import Card from 'react-bootstrap/Card';
import { CardBody } from "react-bootstrap";
import useOnFollow from "../common/hooks/use-on-follow";
import {Mode} from "@cloudscape-design/global-styles";
import { Link } from "@cloudscape-design/components";
import 'bootstrap/dist/css/bootstrap.min.css';

export interface ChatBotTaskCard {
  name: string;
  cardTitle: string;
  taskDescription: string;
  instructions: string;
  url: string;
  //apiPrompt: string;
    theme: Mode;
}

export function TaskCard(props: ChatBotTaskCard) {


const onFollow = useOnFollow();

  const handleFollow = (event, url) => {
    event.preventDefault();
    const newEvent = new CustomEvent("follow", { detail: { href: url, external: false } });
    onFollow(newEvent);
  };

  const handleKeyDown = (event, url) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleFollow(event, url);
    }
  };

  return (
    <div 
      onClick={(e)=>handleFollow(e, props.url)} 
      onKeyDown={(e)=>handleKeyDown(e, props.url)}
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
    >
    <div className={props.theme === Mode.Dark ? "carousel-item-dark-mode" : "carousel-item"}>
      <Card bg="info">
        <Card.Header></Card.Header>
        <CardBody>
          <Card.Title style={{ fontSize: "22px", fontWeight: "700"}}>{props.cardTitle}</Card.Title>
          <Card.Text as= "p">{props.taskDescription}</Card.Text>
          <Link
            variant="primary"
            href={props.url}
            fontSize="heading-m"
            >
                Try it &rarr;
            </Link>
        </CardBody>
      </Card>
      </div>
    </div>
  );
}